import type { ServiceStatus } from "../../domain/value-objects/service-status";
import type {
  ServicesPage,
  SolidarityServiceRepository,
} from "../ports/solidarity-service-repository";

const DEFAULT_PAGE_SIZE = 50;

export interface ListServicesByStatusInput {
  status: ServiceStatus;
  page?: number;
  pageSize?: number;
}

export class ListServicesByStatus {
  constructor(private readonly repo: SolidarityServiceRepository) {}

  async execute(input: ListServicesByStatusInput): Promise<ServicesPage> {
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    return this.repo.listByStatus({
      status: input.status,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  }
}
