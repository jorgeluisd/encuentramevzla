import type {
  ServicesPage,
  SolidarityServiceRepository,
} from "../ports/solidarity-service-repository";

const DEFAULT_PAGE_SIZE = 20;

export interface ListPendingInput {
  page?: number;
  pageSize?: number;
}

export class ListPendingServices {
  constructor(private readonly repo: SolidarityServiceRepository) {}

  async execute(input?: ListPendingInput): Promise<ServicesPage> {
    const pageSize = input?.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, Math.trunc(input?.page ?? 1));
    return this.repo.listByStatus({
      status: "pending",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  }
}
