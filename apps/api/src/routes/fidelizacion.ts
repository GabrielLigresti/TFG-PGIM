import { Router } from 'express';
import {
  beneficioInputSchema,
  filtrosBeneficioSchema,
  grupoInputSchema,
  idParamSchema,
  programaInputSchema,
  type BeneficioInput,
  type GrupoInput,
  type ProgramaInput,
} from '@pgim/shared';
import { autenticar, requierePermiso, tenant, validar, validarParams } from '../middleware/auth';
import { fidelizacionService } from '../services/fidelizacion.service';

// CU-17: programa de puntos, grupos y beneficios. Es por restaurante, sin
// sucursal de trabajo.
export const fidelizacionRouter = Router();

fidelizacionRouter.use(autenticar, tenant);

const ver = requierePermiso('beneficio.ver');
const crear = requierePermiso('beneficio.crear');
const editar = requierePermiso('beneficio.editar');
const eliminar = requierePermiso('beneficio.eliminar');
const conId = validarParams(idParamSchema);

fidelizacionRouter.get('/programa', ver, async (req, res) => {
  res.json(await fidelizacionService.programa(req.tenant!.restauranteId));
});

fidelizacionRouter.post('/programa', crear, validar(programaInputSchema), async (req, res) => {
  res
    .status(201)
    .json(
      await fidelizacionService.crearPrograma(req.tenant!.restauranteId, req.body as ProgramaInput),
    );
});

fidelizacionRouter.get('/grupos', ver, async (req, res) => {
  res.json(await fidelizacionService.grupos(req.tenant!.restauranteId));
});

fidelizacionRouter.post('/grupos', crear, validar(grupoInputSchema), async (req, res) => {
  res
    .status(201)
    .json(await fidelizacionService.crearGrupo(req.tenant!.restauranteId, req.body as GrupoInput));
});

fidelizacionRouter.put(
  '/grupos/:id',
  editar,
  conId,
  validar(grupoInputSchema),
  async (req, res) => {
    res.json(
      await fidelizacionService.editarGrupo(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as GrupoInput,
      ),
    );
  },
);

fidelizacionRouter.delete('/grupos/:id', eliminar, conId, async (req, res) => {
  await fidelizacionService.borrarGrupo(req.tenant!.restauranteId, req.params.id as string);
  res.status(204).end();
});

fidelizacionRouter.get('/beneficios', ver, async (req, res) => {
  const filtros = filtrosBeneficioSchema.parse(req.query);
  res.json(await fidelizacionService.beneficios(req.tenant!.restauranteId, filtros));
});

fidelizacionRouter.post('/beneficios', crear, validar(beneficioInputSchema), async (req, res) => {
  res
    .status(201)
    .json(
      await fidelizacionService.crearBeneficio(
        req.tenant!.restauranteId,
        req.body as BeneficioInput,
      ),
    );
});

fidelizacionRouter.put(
  '/beneficios/:id',
  editar,
  conId,
  validar(beneficioInputSchema),
  async (req, res) => {
    res.json(
      await fidelizacionService.editarBeneficio(
        req.tenant!.restauranteId,
        req.params.id as string,
        req.body as BeneficioInput,
      ),
    );
  },
);

fidelizacionRouter.post('/beneficios/:id/relanzar', editar, conId, async (req, res) => {
  res.json(
    await fidelizacionService.relanzarBeneficio(req.tenant!.restauranteId, req.params.id as string),
  );
});

// Baja lógica: el beneficio queda en el historial de los pagos que lo usaron.
fidelizacionRouter.delete('/beneficios/:id', eliminar, conId, async (req, res) => {
  await fidelizacionService.darDeBajaBeneficio(req.tenant!.restauranteId, req.params.id as string);
  res.status(204).end();
});
