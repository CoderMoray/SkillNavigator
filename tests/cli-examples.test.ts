import { describe, expect, it } from "vitest";
import {
  skillnavInstallExample,
  skillnavInstallWithRegistryExample,
} from "../apps/web/lib/cli-examples";

const REGISTRY = "https://registry.example.com/api";

describe("skillnav install examples", () => {
  it("always emits the required --dir flag", () => {
    expect(skillnavInstallExample("demo-skill")).toBe(
      "skillnav install demo-skill --dir ./skills/demo-skill"
    );
    expect(skillnavInstallWithRegistryExample("demo-skill", "latest", REGISTRY)).toBe(
      `skillnav --registry ${REGISTRY} install demo-skill --dir ./skills/demo-skill`
    );
  });

  it("keeps --version when a concrete version is given", () => {
    expect(skillnavInstallExample("demo-skill", "1.2.3")).toBe(
      "skillnav install demo-skill --version 1.2.3 --dir ./skills/demo-skill"
    );
    expect(skillnavInstallWithRegistryExample("demo-skill", "1.2.3", REGISTRY)).toBe(
      `skillnav --registry ${REGISTRY} install demo-skill --version 1.2.3 --dir ./skills/demo-skill`
    );
  });

  it("keeps --registry before the subcommand (it is a global option)", () => {
    const command = skillnavInstallWithRegistryExample("demo-skill", "latest", REGISTRY);
    expect(command.indexOf("--registry")).toBeLessThan(command.indexOf(" install "));
  });
});
