import type { PatientListParser, ParsedPatientList, ParsedPatientRow } from "../ports/patient-list-parser";
import type {
  AdmissionRepository,
  AuditEntry,
  AuditLog,
  CandidateKeys,
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
  loadCandidatesKeys: CandidateKeys | null = null;
  inserted: NewPatientRow[] = [];
  updated: PatientUpdateRow[] = [];
  constructor(private readonly existing: ExistingPatient[] = []) {}
  async loadCandidates(keys: CandidateKeys): Promise<ExistingPatient[]> {
    this.loadCandidatesKeys = keys; // el fake devuelve todo (superconjunto trivial)
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
  resolveCalls = 0;
  ids = new Map<string, string>();
  async resolveByName(name: string): Promise<string> {
    this.resolveCalls++;
    const found = this.ids.get(name);
    if (found) return found;
    const id = `ho-${++this.seq}`;
    this.ids.set(name, id);
    return id;
  }
  // Solo verifica pertenencia (carga scoped): NO crea. Null si no lo conoce.
  async resolveExisting(name: string): Promise<string | null> {
    return this.ids.get(name) ?? null;
  }
}

class FakeAdmissions implements AdmissionRepository {
  createManyCalls = 0;
  inserted: NewAdmissionRow[] = [];
  constructor(private readonly existing = new Map<string, string>()) {}
  loadExistingIdsArg: string[] | null = null;
  async loadExistingIds(patientIds: string[]): Promise<Map<string, string>> {
    this.loadExistingIdsArg = patientIds;
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

  it("does NOT merge a same-name patient without document across a different hospital", async () => {
    // Maria ya está en DB con ingreso en Hospital X (ho-1), sin cédula.
    const existingPatient: ExistingPatient = {
      id: "pt-maria",
      name: (await import("../../domain/value-objects/person-name")).PersonName.fromRaw("Maria Lopez"),
      document: null,
      isMinor: false,
      status: "admitted",
    };
    const patients = new FakePatients([existingPatient]);
    const admissions = new FakeAdmissions(new Map([["pt-maria|ho-1", "ad-maria"]]));
    const hospitals = new FakeHospitals();
    hospitals.ids.set("Hospital X", "ho-1");
    hospitals.ids.set("Hospital Y", "ho-2"); // distinto hospital
    const repos = buildRepos({ patients, admissions, hospitals });
    const patientsRepo = repos.patients as FakePatients;
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [row({ fingerprint: "y1", fullName: "Maria Lopez", hospitalName: "Hospital Y" })],
      }),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    // Mismo nombre, sin cédula, hospital distinto → NO fusiona (posibles homónimos).
    expect(summary.mergedPatients).toBe(0);
    expect(summary.newPatients).toBe(1);
    expect(patientsRepo.inserted).toHaveLength(1);
  });

  it("loadCandidates recibe las cédulas y tokens del lote (no carga toda la tabla)", async () => {
    const { DocumentId } = await import("../../domain/value-objects/document-id");
    const { PersonName } = await import("../../domain/value-objects/person-name");
    const repos = buildRepos();
    const patients = repos.patients as FakePatients;
    const uow = new FakeUnitOfWork(repos);
    let n = 0;

    await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [
          row({ fingerprint: "a", fullName: "Carlos Mendoza", documentNumber: "24.140.952" }),
          row({ fingerprint: "b", fullName: "Lucia Perez" }),
        ],
      }),
      uow,
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    const keys = patients.loadCandidatesKeys!;
    expect(keys.documents).toEqual([DocumentId.fromRaw("24.140.952").normalized]);
    expect([...keys.tokens].sort()).toEqual(
      [
        ...PersonName.fromRaw("Carlos Mendoza").tokens,
        ...PersonName.fromRaw("Lucia Perez").tokens,
      ].sort(),
    );
  });

  it("preserva 'menor' del nombre como is_minor + nota sensible (no en el nombre)", async () => {
    const repos = buildRepos();
    const patients = repos.patients as FakePatients;
    const sensitive = repos.sensitive as FakeSensitive;
    const uow = new FakeUnitOfWork(repos);
    let n = 0;

    await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [
          row({ fingerprint: "m1", fullName: "Adrian Diaz Menor", hospitalName: "Hospital X" }),
        ],
      }),
      uow,
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    const inserted = patients.inserted[0]!;
    expect(inserted.name.normalized).toBe("adrian diaz"); // el nombre NO contiene 'menor'
    expect(inserted.isMinor).toBe(true); // campo NO expuesto por el buscador
    expect(sensitive.notes.some((nt) => /menor de edad/i.test(nt.text))).toBe(true);
  });

  it("preserva el fallecimiento del nombre como status deceased + nota sensible (no en el nombre)", async () => {
    const repos = buildRepos();
    const patients = repos.patients as FakePatients;
    const sensitive = repos.sensitive as FakeSensitive;
    const uow = new FakeUnitOfWork(repos);
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [
          row({ fingerprint: "d1", fullName: "Pedro Gomez Fallecido", hospitalName: "Hospital X" }),
        ],
      }),
      uow,
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    const inserted = patients.inserted[0]!;
    expect(inserted.name.normalized).toBe("pedro gomez"); // el nombre NO contiene el marcador
    expect(inserted.status).toBe("deceased"); // estado NO expuesto en claro por el buscador
    expect(summary.deceased).toBe(1);
    expect(sensitive.notes.some((nt) => /fallecido/i.test(nt.text))).toBe(true);
  });
});

describe("IngestPatientList — señales de identidad (0020)", () => {
  it("flags a same-name same-hospital row without strong signal as pending_review (no merge)", async () => {
    const repos = buildRepos();
    const patients = repos.patients as FakePatients;
    const audit = repos.audit as FakeAudit;
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [
          row({ fingerprint: "j1", fullName: "Juan Perez", hospitalName: "Hospital X" }),
          row({ fingerprint: "j2", fullName: "Juan Perez", hospitalName: "Hospital X" }),
        ],
      }),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    // El nombre solo no fusiona: el segundo Juan Perez va a revisión, no se colapsa.
    expect(summary.mergedPatients).toBe(0);
    expect(summary.newPatients).toBe(1);
    expect(summary.pendingReview).toBe(1);
    expect(patients.inserted).toHaveLength(2);
    expect(audit.entries.some((e) => e.action === "dedup_pending_review")).toBe(true);
  });

  it("merges rows that share a phone even across different hospitals (a transfer)", async () => {
    const { PersonName } = await import("../../domain/value-objects/person-name");
    const { NormalizedPhone } = await import("../../domain/value-objects/normalized-phone");
    const existing: ExistingPatient = {
      id: "pt-maria",
      name: PersonName.fromRaw("Maria Lopez"),
      document: null,
      phone: NormalizedPhone.fromRaw("0414-1234567"),
      isMinor: false,
      status: "admitted",
    };
    const patients = new FakePatients([existing]);
    const admissions = new FakeAdmissions(new Map([["pt-maria|ho-1", "ad-maria"]]));
    const hospitals = new FakeHospitals();
    hospitals.ids.set("Hospital X", "ho-1");
    hospitals.ids.set("Hospital Y", "ho-2");
    const repos = buildRepos({ patients, admissions, hospitals });
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [
          row({ fingerprint: "m1", fullName: "Maria Lopez", hospitalName: "Hospital Y", phone: "4141234567" }),
        ],
      }),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    expect(summary.mergedPatients).toBe(1);
    expect(summary.newPatients).toBe(0);
  });

  it("keeps same-name same-hospital rows separate when ages are far apart (homonyms)", async () => {
    const { PersonName } = await import("../../domain/value-objects/person-name");
    const existing: ExistingPatient = {
      id: "pt-c",
      name: PersonName.fromRaw("Carlos Ruiz"),
      document: null,
      age: 8,
      isMinor: true,
      status: "admitted",
    };
    const patients = new FakePatients([existing]);
    const admissions = new FakeAdmissions(new Map([["pt-c|ho-1", "ad-c"]]));
    const hospitals = new FakeHospitals();
    hospitals.ids.set("Hospital X", "ho-1");
    const repos = buildRepos({ patients, admissions, hospitals });
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [row({ fingerprint: "c1", fullName: "Carlos Ruiz", hospitalName: "Hospital X", age: 40 })],
      }),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    expect(summary.mergedPatients).toBe(0);
    expect(summary.newPatients).toBe(1);
  });

  it("completes a missing age when merging by document", async () => {
    const { PersonName } = await import("../../domain/value-objects/person-name");
    const { DocumentId } = await import("../../domain/value-objects/document-id");
    const existing: ExistingPatient = {
      id: "pt-a",
      name: PersonName.fromRaw("Ana Gil"),
      document: DocumentId.fromRaw("12.345.678"),
      age: null,
      isMinor: false,
      status: "admitted",
    };
    const patients = new FakePatients([existing]);
    const admissions = new FakeAdmissions(new Map([["pt-a|ho-1", "ad-a"]]));
    const hospitals = new FakeHospitals();
    hospitals.ids.set("Hospital X", "ho-1");
    const repos = buildRepos({ patients, admissions, hospitals });
    let n = 0;

    await new IngestPatientList({
      parser: new FakeParser({
        sheet: "S",
        rows: [
          row({ fingerprint: "a1", fullName: "Ana Gil", hospitalName: "Hospital X", documentNumber: "12.345.678", age: 33 }),
        ],
      }),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

    expect(patients.updated.some((u) => u.changes.age === 33)).toBe(true);
  });
});

describe("IngestPatientList.ingestParsed — reasignación (skipRawPersist)", () => {
  // Filas ya presentes en raw_rows (fingerprint conocido).
  class RawRowsAllPresent implements RawRowStore {
    async persistNew(): Promise<Set<string>> {
      return new Set(); // nada nuevo
    }
  }

  it("does NOT process an already-present row by default (idempotencia)", async () => {
    const repos = buildRepos({ rawRows: new RawRowsAllPresent() });
    const patients = repos.patients as FakePatients;
    const list: ParsedPatientList = {
      sheet: "S",
      rows: [row({ fingerprint: "r1", fullName: "Ana Gil", hospitalName: null })],
    };
    let n = 0;
    await new IngestPatientList({
      parser: new FakeParser(list),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).ingestParsed(list, { uploadedBy: null, forcedHospitalId: "ho-A" });

    expect(patients.inserted).toHaveLength(0);
  });

  it("reprocesses an already-present row when skipRawPersist is set (reassignment)", async () => {
    const repos = buildRepos({ rawRows: new RawRowsAllPresent() });
    const patients = repos.patients as FakePatients;
    const list: ParsedPatientList = {
      sheet: "S",
      rows: [row({ fingerprint: "r1", fullName: "Ana Gil", hospitalName: null })],
    };
    let n = 0;
    const summary = await new IngestPatientList({
      parser: new FakeParser(list),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).ingestParsed(list, { uploadedBy: null, forcedHospitalId: "ho-A", skipRawPersist: true });

    expect(patients.inserted).toHaveLength(1);
    expect(summary.newAdmissions).toBe(1);
  });
});

describe("IngestPatientList.ingestParsed", () => {
  // Paridad: ingestParsed sobre una lista ya parseada deduplica/persiste igual que execute.
  it("deduplica y persiste igual que el camino Excel (paridad de summary)", async () => {
    const list: ParsedPatientList = {
      sheet: "Sheet1",
      rows: [
        row({ fingerprint: "h1", fullName: "Carlos Mendoza", age: 40, documentNumber: "24.140.952", phone: "0412-1112233" }),
        row({ fingerprint: "h2", fullName: "Carlos Mendoza", age: 40, documentNumber: "24.140.952" }), // merge
        row({ fingerprint: "h3", fullName: "Lucia Perez", age: 10 }), // menor, new
      ],
    };
    const repos = buildRepos();
    const patients = repos.patients as FakePatients;
    const uow = new FakeUnitOfWork(repos);
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser(list),
      uow,
      newId: () => `id-${++n}`,
    }).ingestParsed(list, { uploadedBy: null });

    expect(summary.rowsRead).toBe(3);
    expect(summary.newPatients).toBe(2);
    expect(summary.mergedPatients).toBe(1);
    expect(summary.minors).toBe(1);
    expect(summary.newAdmissions).toBe(2);
    expect(summary.otherHospitalsMentioned).toBe(0);
    expect(uow.runs).toBe(1);
    expect(patients.createManyCalls).toBe(1);
    expect(patients.inserted).toHaveLength(2);
  });

  // ADR-0006: carga scoped → una fila que nombra OTRO hospital NO se atribuye al propio;
  // se segrega y se audita fila por fila.
  it("segregates a row that names a different hospital in a scoped upload", async () => {
    const list: ParsedPatientList = {
      sheet: "S",
      rows: [row({ fingerprint: "f1", fullName: "Ana Rojas", documentNumber: "12.345.678", hospitalName: "Hospital Y" })],
    };
    const repos = buildRepos();
    const patients = repos.patients as FakePatients;
    const admissions = repos.admissions as FakeAdmissions;
    const hospitals = repos.hospitals as FakeHospitals;
    const audit = repos.audit as FakeAudit;
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser(list),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).ingestParsed(list, { uploadedBy: "u@h.test", forcedHospitalId: "ho-forced" });

    // No se atribuye al hospital propio: no hay paciente ni admisión.
    expect(hospitals.resolveCalls).toBe(0); // en scoped no se crea por nombre
    expect(summary.foreignRows).toBe(1);
    expect(patients.inserted).toHaveLength(0);
    expect(admissions.inserted).toHaveLength(0);
    expect(summary.otherHospitalsMentioned).toBe(1);
    expect(audit.entries.some((e) => e.action === "ingest_foreign_hospital_row")).toBe(true);
  });

  it("ingests a scoped row that names the member's OWN hospital (via catalog)", async () => {
    const hospitals = new FakeHospitals();
    hospitals.ids.set("Hospital A", "ho-A"); // el hospital del miembro, conocido en el catálogo
    const repos = buildRepos({ hospitals });
    const patients = repos.patients as FakePatients;
    let n = 0;
    const list: ParsedPatientList = {
      sheet: "S",
      rows: [row({ fingerprint: "o1", fullName: "Ana Rojas", documentNumber: "12.345.678", hospitalName: "Hospital A" })],
    };

    const summary = await new IngestPatientList({
      parser: new FakeParser(list),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).ingestParsed(list, { uploadedBy: null, forcedHospitalId: "ho-A" });

    expect(summary.foreignRows).toBe(0);
    expect(patients.inserted).toHaveLength(1);
    expect(summary.newAdmissions).toBe(1);
  });

  // D8: el toggle explícito "¿falleció?" marca el estado aunque la nota no lo diga.
  it("deceased=true fuerza el estado fallecido sin marcador en la nota", async () => {
    const list: ParsedPatientList = {
      sheet: "voz",
      rows: [row({ fingerprint: "d1", fullName: "Rosa Mora", hospitalName: null, clinicalNotes: "estable", deceased: true })],
    };
    const repos = buildRepos();
    const patients = repos.patients as FakePatients;
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser(list),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).ingestParsed(list, { uploadedBy: null, forcedHospitalId: "ho-A" });

    expect(patients.inserted[0]!.status).toBe("deceased");
    expect(summary.deceased).toBe(1);
  });

  // Fila dictada (voz/manual): sin columna de hospital, igual se admite en el hospital forzado.
  it("una fila sin hospital + forcedHospitalId crea la admisión en el hospital forzado", async () => {
    const list: ParsedPatientList = {
      sheet: "voz",
      rows: [row({ fingerprint: "v1", fullName: "Pedro Suarez", documentNumber: "30.111.222", hospitalName: null, clinicalNotes: "dolor toracico" })],
    };
    const repos = buildRepos();
    const admissions = repos.admissions as FakeAdmissions;
    const sensitive = repos.sensitive as FakeSensitive;
    let n = 0;

    const summary = await new IngestPatientList({
      parser: new FakeParser(list),
      uow: new FakeUnitOfWork(repos),
      newId: () => `id-${++n}`,
    }).ingestParsed(list, { uploadedBy: "uploader@hosp.test", forcedHospitalId: "ho-A" });

    expect(summary.newPatients).toBe(1);
    expect(summary.newAdmissions).toBe(1);
    expect(admissions.inserted[0]!.hospitalId).toBe("ho-A");
    expect(summary.otherHospitalsMentioned).toBe(0);
    // La nota clínica se ancla a la admisión del hospital forzado.
    expect(sensitive.notes).toHaveLength(1);
  });
});
