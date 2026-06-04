import type { Pool, QueryResultRow } from '../database/types.js';
import type { Project, NewProject } from '../../domain/entities/project.js';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import { toDomainError } from '../database/pg-errors.js';

interface ProjectRow extends QueryResultRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PgProjectRepository implements ProjectRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: NewProject): Promise<Project> {
    try {
      const result = await this.pool.query<ProjectRow>(
        `INSERT INTO projects (slug, name, description)
         VALUES ($1, $2, $3)
         RETURNING id, slug, name, description, created_at, updated_at`,
        [input.slug, input.name, input.description ?? null],
      );
      return mapRow(result.rows[0]);
    } catch (err) {
      const domainErr = toDomainError(err);
      if (domainErr) throw domainErr;
      throw err;
    }
  }

  async findById(id: string): Promise<Project | null> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT id, slug, name, description, created_at, updated_at
       FROM projects WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT id, slug, name, description, created_at, updated_at
       FROM projects WHERE slug = $1`,
      [slug],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async list(opts: {
    limit: number;
    offset: number;
  }): Promise<{ items: Project[]; total: number }> {
    const [itemsResult, totalResult] = await Promise.all([
      this.pool.query<ProjectRow>(
        `SELECT id, slug, name, description, created_at, updated_at
         FROM projects
         ORDER BY created_at DESC, id ASC
         LIMIT $1 OFFSET $2`,
        [opts.limit, opts.offset],
      ),
      this.pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM projects`),
    ]);
    return {
      items: itemsResult.rows.map(mapRow),
      total: parseInt(totalResult.rows[0].count, 10),
    };
  }
}
