import type { PatientListParser, ParsedPatientList, ParsedPatientRow } from "../ports/patient-list-parser";
import type {
  AdmissionRepository,
  AuditEntry,
  AuditLog,
  ExistingPatient,
  HospitalRepository,
  IngestionRepositories,
  IngestionUnitOfWork,
  NewAdmissionRow,
  NewClinicalNoteRow,
  NewContactRow,
  NewPatientRow,
  PatientRepository,
  PatientUpdateRow,
  RawRowStore,
  SensitiveDataStore,
} from "../ports/repositories";
import { IngestPatientList } from "./ingest-patient-list";

const row = (over: Partial<ParsedPatientRow>): ParsedPatientRow => ({
  fingerprint: "x",
  raw: {},
  hospitalName: "Hospital X",
  fullName: null,
  age: null,
  documentNumber: null,
  phone: null,
  address: null,
  clinicalNotes: null,
  ...over,
});

class FakeParser implements PatientListParser {
  constructor(private readonly list: ParsedPatientList) {}
  parse(): ParsedPatientList {
    return this.list;
  }
}

class FakeRawRows implements RawRowStore {
  async persistNew(rows: ParsedPatientRow[]): Promise<Set<string>> {
    return new Set(rows.map((r) => r.fingerprint)); // todo nuevo
  }
}

// Acumula las escrituras en lote y CUENTA las llamadas (anti-N+1).
class FakePatients implements PatientRepository {
  createManyCalls = 0;
  updateManyCalls = 0;
  inserted: NewPatientRow[] = [];
  updated: PatientUpdateRow[] = [];
  constructor(private readonly existing: ExistingPatient[] = []) {}
  async loadAll(): Promise<ExistingPatient[]> {
    return this.existing.map((r) => ({ ...r }));
  }
  async createMany(rows: NewPatientRow[]): Promise<void> {
    this.createManyCalls++;
    this.inserted.push(...rows);
  }
  async updateMany(updates: PatientUpdateRow[]): Promise<void> {
    this.updateManyCalls++;
    this.updated.push(...updates);
  }
}

class FakeHospitals implements HospitalRepository {
  private seq = 0;
  ids = new Map<string, string>();
  async resolveByName(name: string): Promise<string> {
    const found = this.ids.get(name);
    if (found) return found;
    const id = `ho-${++this.seq}`;
    this.ids.set(name, id);
    return id;
  }
}

class FakeAdmissions implements AdmissionRepository {
  createManyCalls = 0;
  inserted: NewAdmissionRow[] = [];
  constructor(private readonly existing = new Map<string, string>()) {}
  async loadExistingIds(): Promise<Map<string, string>> {
    return new Map(this.existing);
  }
  async createMany(rows: NewAdmissionRow[]): Promise<void> {
    this.createManyCalls++;
    this.inserted.push(...rows);
  }
}

class FakeSensitive implements SensitiveDataStore {
  saveContactsCalls = 0;
  saveNotesCalls = 0;
  contacts: NewContactRow[] = [];
  notes: NewClinicalNoteRow[] = [];
  async saveContacts(rows: NewContactRow[]): Promise<void> {
    this.saveContactsCalls++;
    this.contacts.push(...rows);
  }
  async saveClinicalNotes(rows: NewClinicalNoteRow[]): Promise<void> {
    this.saveNotesCalls++;
    this.notes.push(...rows);
  }
}

class FakeAudit implements AuditLog {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
  async recordMany(entries: AuditEntry[]): Promise<void> {
    this.entries.push(...entries);
  }
}

// UoW de prueba: ejecuta el work con los fakes; cuenta cuántas transacciones se abren.
class FakeUnitOfWork implements IngestionUnitOfWork {
  runs = 0;
  constructor(private readonly repos: IngestionRepositories) {}
  async runAtomic<T>(work: (repos: IngestionRepositories) => Promise<T>): Promise<T> {
    this.runs++;
    return work(this.repos);
  }
}

function buildRepos(over: Partial<IngestionRepositories> = {}): IngestionRepositories {
  return {
    rawRows: new FakeRawRows(),
    patients: new FakePatients(),
    hospitals: new FakeHospitals(),
    admissions: new FakeAdmissions(),
    sensitive: new FakeSensitive(),
    audit: new FakeAudit(),
    ...over,
  };
}

describe("IngestPatientList", () => {
  it("ingests, deduplicates and routes sensitive data (bulk, una transacción)", async () => {
    const list: ParsedPatientList = {
      sheet: "Sheet1",
      rows: [
        row({ fingerprint: "h1", fullName: "Carlos Mendoza", age: 40, documentNumber: "24.140.952", phone: "0412-1112233", address: "Caracas" }),
        row({ fingerprint: "h2", fullName: "Carlos Mendoza", age: 40, documentNumber: "24.140.952" }), // merge
        row({ fingerprint: "h3", fullName: "Lucia Perez", age: 10 }), // menor, new
        row({ fingerprint: "h4", fullName: "Rosa Diaz", age: 70, documentNumber: "24.140.952" }), // conflicto
        row({ fingerprint: "h5", fullName: "Pedro Gomez", age: 55, documentNumber: "30.111.222", clinicalNotes: "paciente falleció" }), // deceased
      ],
    };
    const repos = buildRepos();
    const patients = repos.patients as FakePatients;
    const admissions = repos.admissions as FakeAdmissions;
    const sensitive = repos.sensitive as FakeSensitive;
    const audit = repos.audit as FakeAudit;
    const uow = new FakeUnitOfWork(repos);
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser(list),
      uow,
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    // Paridad de comportamiento con el diseño anterior.
    expect(summary.rowsRead).toBe(5);
    expect(summary.newPatients).toBe(3);
    expect(summary.mergedPatients).toBe(1);
    expect(summary.documentConflicts).toBe(1);
    expect(summary.minors).toBe(1);
    expect(summary.deceased).toBe(1);
    expect(summary.newAdmissions).toBe(4);
    expect(summary.hospitals).toBe(1);
    expect(sensitive.contacts).toHaveLength(1);
    expect(sensitive.notes).toHaveLength(1);
    expect(audit.entries.some((e) => e.action === "dedup_document_conflict")).toBe(true);
    expect(audit.entries.some((e) => e.action === "ingest_patient_list")).toBe(true);

    // Anti-N+1: una sola transacción y UNA llamada bulk por tabla (no N).
    expect(uow.runs).toBe(1);
    expect(patients.createManyCalls).toBe(1);
    expect(patients.inserted).toHaveLength(4); // Carlos, Lucia, Rosa, Pedro
    expect(admissions.createManyCalls).toBe(1);
    expect(admissions.inserted).toHaveLength(4);
    expect(sensitive.saveContactsCalls).toBe(1);
    expect(sensitive.saveNotesCalls).toBe(1);
  });

  it("reuses an existing admission (cross-file) instead of duplicating it", async () => {
    // Carlos ya está en DB y ya tiene una admisión en Hospital X.
    const existingPatient: ExistingPatient = {
      id: "pt-existing",
      name: (await import("../../domain/value-objects/person-name")).PersonName.fromRaw("Carlos Mendoza"),
      document: (await import("../../domain/value-objects/document-id")).DocumentId.fromRaw("24.140.952"),
      isMinor: false,
      status: "admitted",
    };
    const patients = new FakePatients([existingPatient]);
    const admissions = new FakeAdmissions(new Map([["pt-existing|ho-1", "ad-existing"]]));
    const hospitals = new FakeHospitals();
    hospitals.ids.set("Hospital X", "ho-1"); // mismo id que en el mapa de admisiones
    const sensitive = new FakeSensitive();
    const repos = buildRepos({ patients, admissions, hospitals, sensitive });
    const uow = new FakeUnitOfWork(repos);
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [
          row({ fingerprint: "z1", fullName: "Carlos Mendoza", documentNumber: "24.140.952", clinicalNotes: "nota nueva" }),
        ],
      }),
      uow,
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    expect(summary.mergedPatients).toBe(1);
    expect(summary.newAdmissions).toBe(0); // reusa la existente
    expect(admissions.inserted).toHaveLength(0);
    // La nota clínica se ancla a la admisión EXISTENTE.
    expect(sensitive.notes).toEqual([{ admissionId: "ad-existing", text: "nota nueva" }]);
  });
});
