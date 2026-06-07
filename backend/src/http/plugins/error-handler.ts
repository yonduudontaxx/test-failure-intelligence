import fp from 'fastify-plugin';
import type { FastifyError } from 'fastify';
import { failure } from '../helpers/envelope.js';
import { ForeignKeyError, UniqueConstraintError } from '../../domain/errors/index.js';
import { IngestionFailedError } from '../../application/ingestion/errors.js';

const API_PREFIX = '/api/v1';
const PROJECTS_PREFIX = '/api/v1/projects';
const RUNS_SUBPATH_RE = /\/api\/v1\/projects\/[^/]+\/runs\//;

export default fp(
  async (fastify) => {
    fastify.setErrorHandler<FastifyError>((err, request, reply) => {
      if (!request.url.startsWith(API_PREFIX)) {
        // Delegate to the parent (default) handler via Fastify's handler chain
        reply.send(err);
        return;
      }

      if (err.validation) {
        reply.code(400).send(failure('VALIDATION_ERROR', err.message));
        return;
      }

      if (err instanceof UniqueConstraintError && err.constraint === 'projects_slug_key') {
        reply.code(409).send(failure('DUPLICATE_PROJECT_SLUG', err.message));
        return;
      }

      if (err instanceof IngestionFailedError) {
        reply.code(422).send(failure('INGESTION_FAILED', err.message));
        return;
      }

      if (err instanceof ForeignKeyError && err.constraint === 'test_runs_project_id_fkey') {
        reply.code(404).send(failure('PROJECT_NOT_FOUND', 'Project not found'));
        return;
      }

      if (err.statusCode === 404 && RUNS_SUBPATH_RE.test(request.url)) {
        reply.code(404).send(failure('RUN_NOT_FOUND', err.message));
        return;
      }

      if (err.statusCode === 404 && request.url.startsWith(PROJECTS_PREFIX)) {
        reply.code(404).send(failure('PROJECT_NOT_FOUND', err.message));
        return;
      }

      fastify.log.error({ err, url: request.url }, 'unhandled error in /api/v1');
      reply.code(500).send(failure('INTERNAL_ERROR', 'Internal server error'));
    });
  },
  { name: 'error-handler' },
);
