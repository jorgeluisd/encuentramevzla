import { canModerate, canUpload, isRole } from "./team-role";

describe("team-role", () => {
  describe("isRole", () => {
    it("accepts the known roles", () => {
      expect(isRole("uploader")).toBe(true);
      expect(isRole("moderator")).toBe(true);
    });

    it("rejects anything else", () => {
      expect(isRole("admin")).toBe(false);
      expect(isRole("")).toBe(false);
      expect(isRole("Moderator")).toBe(false);
    });
  });

  describe("canUpload", () => {
    it("is allowed for both roles", () => {
      expect(canUpload("uploader")).toBe(true);
      expect(canUpload("moderator")).toBe(true);
    });
  });

  describe("canModerate", () => {
    it("is only allowed for moderator", () => {
      expect(canModerate("moderator")).toBe(true);
      expect(canModerate("uploader")).toBe(false);
    });
  });
});
