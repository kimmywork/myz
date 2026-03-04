export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string;
  builtin?: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

export interface SkillFileRecord {
  skillId: string;
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
  updatedAt: string;
}

export interface SkillInstruction {
  name: string;
  description: string;
  body: string;
}

export interface SkillImportFile {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
}

export interface SkillImportPayload {
  rootDir?: string;
  files: SkillImportFile[];
}
