import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

export interface RegistryManifestDepartment {
  name: string;
  staffRows: number;
  studentRows: number;
  offeringRows: number;
  enrollmentRows: number;
  sectionRows: number;
  anchor: {
    teacherName: string;
    teacherEmail: string;
    offeringExternalId: string;
    courseCode: string;
    courseTitle: string;
    peerEmails: string[];
    studentEmails: string[];
  };
}

export interface RegistryManifest {
  generatedAt: string;
  departments: Record<"cse" | "swe", RegistryManifestDepartment>;
}

export function registryRoot(): string {
  return resolve(process.env.REGISTRY_FIXTURE_ROOT ?? "tests/fixtures/registry-full");
}

export function registryManifest(): RegistryManifest {
  return JSON.parse(readFileSync(join(registryRoot(), "manifest.json"), "utf8")) as RegistryManifest;
}

export function registryCsv(department: "cse" | "swe", file: "staff" | "students" | "offerings" | "enrollments") {
  return readFileSync(join(registryRoot(), department, `${file}.csv`), "utf8");
}
