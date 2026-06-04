export type Project = Readonly<{
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type NewProject = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
