import {
  canAccessReviewQueue,
  canManageHospitalTeam,
  canModerate,
  canResolveReview,
  canUpload,
  isRole,
} from "./team-role";

describe("team-role", () => {
  describe("isRole", () => {
    it("accepts the known roles", () => {
      expect(isRole("uploader")).toBe(true);
      expect(isRole("moderator")).toBe(true);
      expect(isRole("hospital_admin")).toBe(true);
    });

    it("rejects anything else", () => {
      expect(isRole("admin")).toBe(false);
      expect(isRole("")).toBe(false);
      expect(isRole("Moderator")).toBe(false);
    });
  });

  describe("canUpload", () => {
    it("is allowed for every role", () => {
      expect(canUpload("uploader")).toBe(true);
      expect(canUpload("moderator")).toBe(true);
      expect(canUpload("hospital_admin")).toBe(true);
    });
  });

  describe("canModerate", () => {
    it("is only allowed for the global moderator", () => {
      expect(canModerate("moderator")).toBe(true);
      expect(canModerate("uploader")).toBe(false);
      // hospital_admin NO es moderador global (no decide fusiones globales).
      expect(canModerate("hospital_admin")).toBe(false);
    });
  });

  describe("canManageHospitalTeam", () => {
    it("is allowed for hospital_admin and global moderator", () => {
      expect(canManageHospitalTeam("hospital_admin")).toBe(true);
      expect(canManageHospitalTeam("moderator")).toBe(true);
    });

    it("is denied for plain uploader", () => {
      expect(canManageHospitalTeam("uploader")).toBe(false);
    });
  });

  describe("canAccessReviewQueue", () => {
    it("permite a hospital_admin y moderador, no al uploader", () => {
      expect(canAccessReviewQueue("hospital_admin")).toBe(true);
      expect(canAccessReviewQueue("moderator")).toBe(true);
      expect(canAccessReviewQueue("uploader")).toBe(false);
    });
  });

  describe("canResolveReview", () => {
    it("lets the global moderator resolve any hospital's queue", () => {
      const member = { role: "moderator" as const, hospitalId: null };
      expect(canResolveReview(member, "ho-1")).toBe(true);
      expect(canResolveReview(member, null)).toBe(true);
    });

    it("lets a hospital_admin resolve only their own hospital", () => {
      const member = { role: "hospital_admin" as const, hospitalId: "ho-1" };
      expect(canResolveReview(member, "ho-1")).toBe(true);
      expect(canResolveReview(member, "ho-2")).toBe(false);
    });

    it("denies an uploader", () => {
      const member = { role: "uploader" as const, hospitalId: "ho-1" };
      expect(canResolveReview(member, "ho-1")).toBe(false);
    });

    it("denies a hospital_admin without an assigned hospital", () => {
      const member = { role: "hospital_admin" as const, hospitalId: null };
      expect(canResolveReview(member, "ho-1")).toBe(false);
    });
  });
});
