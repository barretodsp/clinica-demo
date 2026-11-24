import { env } from '../config/env.js';
import { signServiceToken } from './service-token.js';

/** Gera o token de serviço fixo (FHIR). Imprime uma vez; configure no cliente integrador. */
const token = signServiceToken(env().SERVICE_TOKEN_SECRET);
console.log(token);
