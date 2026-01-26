import { ClientStatus, LeadStage } from '@prisma/client';

interface ScoreInput {
  source?: string | null;
  tags?: string[];
  status?: ClientStatus;
  stage?: LeadStage;
}

const SOURCE_SCORES: Record<string, number> = {
  Instagram: 15,
  Facebook: 10,
  Indicacao: 20,
  Site: 12,
  WhatsApp: 18
};

function normalizeSource(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  if (key === 'instagram') return 'Instagram';
  if (key === 'facebook') return 'Facebook';
  if (key === 'indicacao' || key === 'indicação') return 'Indicacao';
  if (key === 'whatsapp' || key === 'wpp') return 'WhatsApp';
  if (key === 'google' || key === 'google forms' || key === 'site' || key === 'website' || key === 'web')
    return 'Site';
  // default to original value (no score if not mapped)
  return raw;
}

const TAG_SCORES: Record<string, number> = {
  vip: 25,
  botox: 10,
  laser: 8,
  depilacao: 6,
  bio_sculptra: 30,
  bio_radiesse: 25,
  bio_fraccionado_exossomos: 30,
  bio_exossomos: 20,
  nadh_coenzima: 20,
  toxina_terco_superior: 20,
  toxina_full_face: 25,
  acido_labios: 18,
  acido_nariz: 22,
  acido_1ml: 18,
  acido_4ml: 20,
  remocao_acido_guiada: 18,
  endolaser_abdomen_completo: 28,
  endolaser_abdomen_inferior: 22,
  endolaser_abdomen_superior: 22,
  endolaser_flancos: 22,
  endolaser_costas: 22,
  endolaser_abdomen_flancos: 32,
  endolaser_bracos: 20,
  endolaser_culote: 20,
  endolaser_monte_venus: 15,
  endolaser_bananinha: 20,
  endolaser_interno_coxa: 20,
  endolaser_gluteo: 20,
  endolaser_palpebras: 12,
  endolaser_face_completa: 20,
  endolaser_papada: 20,
  endolaser_face_papada: 25
};

export const calculateLeadScore = (input: ScoreInput): number => {
  let score = 50;

  const normalized = normalizeSource(input.source);
  if (normalized && SOURCE_SCORES[normalized]) {
    score += SOURCE_SCORES[normalized];
  }

  if (input.tags && input.tags.length > 0) {
    score += input.tags.reduce((acc, tag) => acc + (TAG_SCORES[tag.toLowerCase()] ?? 5), 0);
  }

  if (input.status === ClientStatus.VIP) {
    score += 30;
  }

  switch (input.stage) {
    case LeadStage.AGENDOU_CALL:
      score += 40;
      break;
    case LeadStage.ENTROU_CALL:
      score += 60;
      break;
    case LeadStage.COMPROU:
      score += 80;
      break;
    default:
      break;
  }

  return Math.min(score, 100);
};
