import type {
  ServicesPage,
  SolidarityServiceRepository,
} from "../ports/solidarity-service-repository";

const DEFAULT_PAGE_SIZE = 200;

export interface ListAllServicesInput {
  page?: number;
  pageSize?: number;
}

// Lista todas las publicaciones (cualquier estado) para la gestión desde /admin:
// encontrar una publicación y reenviar su enlace de gestión.
export class ListAllServices {
  constructor(private readonly repo: SolidarityServiceRepository) {}

  async execute(input?: ListAllServicesInput): Promise<ServicesPage> {
    const pageSize = input?.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, Math.trunc(input?.page ?? 1));
    return this.repo.listAll({ limit: pageSize, offset: (page - 1) * pageSize });
  }
}
