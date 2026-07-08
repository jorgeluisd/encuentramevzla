import type {
  ListPublishedInput,
  PublicService,
  SolidarityServiceDirectory,
} from "../ports/solidarity-service-directory";

export class ListPublishedServices {
  constructor(private readonly directory: SolidarityServiceDirectory) {}

  async execute(input?: ListPublishedInput): Promise<PublicService[]> {
    return this.directory.list({ category: input?.category, q: input?.q });
  }
}
