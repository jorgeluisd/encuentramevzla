import type { PatientListParser, ParsedPatientList, ParsedPatientRow } from "../ports/patient-list-parser";
import type {
  AdmissionRepository,
  AuditEntry,
  AuditLog,
  ExistingPatient,
  HospitalRepository,
  NewPatient,
  PatientRepository,
  RawRowStore,
  SensitiveDataStore,
} from "../ports/repositories";
import { IngestPatientList } from "./ingest-patient-list";

const row = (over: Partial<ParsedPatientRow>): ParsedPatientRow => ({
  fingerprint: "x",
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

class FakePatients implements PatientRepository {
  private seq = 0;
  rows: ExistingPatient[] = [];
  async loadAll(): Promise<ExistingPatient[]> {
    return this.rows.map((r) => ({ ...r }));
  }
  async create(p: NewPatient): Promise<string> {
    const id = `pt-${++this.seq}`;
    this.rows.push({ id, name: p.name, document: p.document, isMinor: p.isMinor, status: p.status });
    return id;
  }
  async update(): Promise<void> {}
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
  private seq = 0;
  keys = new Map<string, string>();
  async findId(patientId: string, hospitalId: string): Promise<string | null> {
    return this.keys.get(`${patientId}|${hospitalId}`) ?? null;
  }
  async create(input: { patientId: string; hospitalId: string }): Promise<string> {
    const id = `ad-${++this.seq}`;
    this.keys.set(`${input.patientId}|${input.hospitalId}`, id);
    return id;
  }
}

class FakeSensitive implements SensitiveDataStore {
  contacts: unknown[] = [];
  notes: unknown[] = [];
  async saveContact(input: unknown): Promise<void> {
    this.contacts.push(input);
  }
  async saveClinicalNote(input: unknown): Promise<void> {
    this.notes.push(input);
  }
}

class FakeAudit implements AuditLog {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

describe("IngestPatientList", () => {
  it("ingests, deduplicates and routes sensitive data", async () => {
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
    const sensitive = new FakeSensitive();
    const audit = new FakeAudit();
    let n = 0;
    const summary = await new IngestPatientList({
      parser: new FakeParser(list),
      rawRows: new FakeRawRows(),
      patients: new FakePatients(),
      hospitals: new FakeHospitals(),
      admissions: new FakeAdmissions(),
      sensitive,
      audit,
      newId: () => `id-${++n}`,
    }).execute({ fileBytes: new Uint8Array(), uploadedBy: null });

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
  });
});
