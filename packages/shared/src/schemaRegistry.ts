export interface SchemaRegistry<T> {
  latestVersion: string
  versions: Record<string, T>
}

export function createSchemaRegistry<T>(options: {
  latestVersion: string
  versions: Record<string, T>
}): SchemaRegistry<T> {
  return {
    latestVersion: options.latestVersion,
    versions: options.versions,
  }
}
