/** Placeholders for skillnav CLI examples shown in the Web UI. */
export const SKILLNAV_API_KEY_PLACEHOLDER = "sk_…";

export function skillnavLoginExample(apiKey = SKILLNAV_API_KEY_PLACEHOLDER): string {
  return `skillnav login --api-key ${apiKey}`;
}

export function skillnavPublishExample(packagePath = "./my-skill"): string {
  return `skillnav publish ${packagePath}`;
}

export function skillnavDownloadExample(slug = "demo-skill", output = "demo-skill.zip"): string {
  return `skillnav download ${slug} -o ${output}`;
}

export function skillnavInstallExample(slug: string, version?: string): string {
  if (!version || version === "latest") {
    return `skillnav install ${slug}`;
  }
  return `skillnav install ${slug} --version ${version}`;
}

export function skillnavInstallWithRegistryExample(
  slug: string,
  version: string,
  registryUrl: string
): string {
  const versionFlag = version && version !== "latest" ? ` --version ${version}` : "";
  return `skillnav --registry ${registryUrl} install ${slug}${versionFlag}`;
}

export function skillnavHomeCliExamples(): string {
  return [
    `$ ${skillnavLoginExample()}`,
    `$ ${skillnavPublishExample()}`,
    `$ ${skillnavDownloadExample()}`,
  ].join("\n");
}
