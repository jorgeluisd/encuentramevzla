// Ids fijados en draft/aws-migration/CONTRACT.md. Recursos de Blockealo: solo se importan, nunca se modifican.
export const CONTRACT = {
  region: "sa-east-1",
  vpcId: "vpc-013163bdf219f347c",
  privateSubnets: [
    { subnetId: "subnet-055b4e1a319f98fd1", availabilityZone: "sa-east-1a" },
    { subnetId: "subnet-02cd7bc900352026e", availabilityZone: "sa-east-1b" },
  ],
  secrets: {
    dbAdmin: "evzla/db/admin",
    dbPublic: "evzla/db/public",
    dbJob: "evzla/db/job",
    app: "evzla/app",
  },
  userPoolName: "evzla-admin",
  apexDomain: "encuentramevzla.com",
  costTag: { key: "project", value: "encuentramevzla" },
} as const;
