import type {
  LeadRadarEvidence,
  LeadRadarLead,
  LeadRadarLifecycle,
  LeadRadarOverview,
  LeadRadarSearchInput,
  LeadRadarSearchResult,
  LeadRadarSearchStatus,
  LeadRadarSearchSummary,
} from '../../../src/shared/lead-radar';
import type { StoredLeadInput } from './types';

interface SearchRow {
  id: string;
  input_json: string;
  status: LeadRadarSearchStatus;
  candidate_count: number;
  verified_count: number;
  p1_count: number;
  p2_count: number;
  p3_count: number;
  telegram_count: number;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}

interface LeadRow {
  id: string;
  search_id: string;
  name: string;
  category: string;
  city: string;
  country: string;
  address: string | null;
  website: string | null;
  phone: string | null;
  generic_email: string | null;
  telegram_url: string | null;
  score: number;
  confidence: number;
  priority: LeadRadarLead['priority'];
  lifecycle: LeadRadarLifecycle;
  suppressed: number;
  score_components_json: string;
  signals_json: string;
  discovered_at: string;
  last_verified_at: string;
}

interface EvidenceRow {
  id: string;
  company_id: string;
  field_path: string;
  value: string;
  source_url: string;
  source_type: LeadRadarEvidence['sourceType'];
  observed_at: string;
  confidence: number;
  classification: LeadRadarEvidence['classification'];
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function mapSearch(row: SearchRow): LeadRadarSearchSummary {
  return {
    id: row.id,
    input: parseJson<LeadRadarSearchInput>(row.input_json, {
      niche: '', city: '', country: 'UZ', offer: '', desiredCount: 20,
      telegramRequired: false, languages: ['ru', 'uz'],
    }),
    status: row.status,
    candidateCount: Number(row.candidate_count),
    verifiedCount: Number(row.verified_count),
    p1Count: Number(row.p1_count),
    p2Count: Number(row.p2_count),
    p3Count: Number(row.p3_count),
    telegramCount: Number(row.telegram_count),
    errorCode: row.error_code,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapEvidence(row: EvidenceRow): LeadRadarEvidence {
  return {
    id: row.id,
    fieldPath: row.field_path,
    value: row.value,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    observedAt: row.observed_at,
    confidence: Number(row.confidence),
    classification: row.classification,
  };
}

export class LeadRadarStore {
  constructor(private readonly db: D1Database) {}

  async createSearch(orgId: string, input: LeadRadarSearchInput, now: string): Promise<string> {
    const id = `search_${crypto.randomUUID().replaceAll('-', '')}`;
    await this.db.prepare(`INSERT INTO lead_radar_searches (
      id, org_id, input_json, status, created_at
    ) VALUES (?, ?, ?, 'running', ?)`).bind(id, orgId, JSON.stringify(input), now).run();
    return id;
  }

  async finishSearch(
    orgId: string,
    searchId: string,
    update: {
      status: LeadRadarSearchStatus;
      candidateCount: number;
      verifiedCount: number;
      p1Count: number;
      p2Count: number;
      p3Count: number;
      telegramCount: number;
      errorCode: string | null;
      completedAt: string;
    },
  ): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_searches SET
      status = ?, candidate_count = ?, verified_count = ?, p1_count = ?,
      p2_count = ?, p3_count = ?, telegram_count = ?, error_code = ?, completed_at = ?
      WHERE org_id = ? AND id = ?`).bind(
      update.status, update.candidateCount, update.verifiedCount, update.p1Count,
      update.p2Count, update.p3Count, update.telegramCount, update.errorCode,
      update.completedAt, orgId, searchId,
    ).run();
  }

  async insertLead(orgId: string, searchId: string, lead: StoredLeadInput): Promise<string> {
    const id = `lead_${crypto.randomUUID().replaceAll('-', '')}`;
    const statements: D1PreparedStatement[] = [this.db.prepare(`INSERT INTO lead_radar_companies (
      id, org_id, search_id, canonical_key, name, category, city, country,
      address, website, phone, generic_email, telegram_url, score, confidence,
      priority, lifecycle, suppressed, score_components_json, signals_json,
      discovered_at, last_verified_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, orgId, searchId, lead.canonicalKey, lead.name, lead.category,
        lead.city, lead.country, lead.address, lead.website, lead.phone,
        lead.genericEmail, lead.telegramUrl, lead.score, lead.confidence,
        lead.priority, lead.lifecycle, lead.suppressed ? 1 : 0,
        JSON.stringify(lead.scoreComponents), JSON.stringify(lead.signals),
        lead.discoveredAt, lead.lastVerifiedAt, lead.lastVerifiedAt,
      )];
    for (const evidence of lead.evidence) {
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO lead_radar_evidence (
        id, org_id, company_id, field_path, value, source_url, source_type,
        observed_at, confidence, classification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          evidence.id, orgId, id, evidence.fieldPath, evidence.value,
          evidence.sourceUrl, evidence.sourceType, evidence.observedAt,
          evidence.confidence, evidence.classification,
        ));
    }
    await this.db.batch(statements);
    return id;
  }

  async getSearch(orgId: string, searchId: string): Promise<LeadRadarSearchResult | null> {
    const search = await this.db.prepare(`SELECT * FROM lead_radar_searches
      WHERE org_id = ? AND id = ? LIMIT 1`).bind(orgId, searchId).first<SearchRow>();
    if (!search) return null;
    const leadsResult = await this.db.prepare(`SELECT * FROM lead_radar_companies
      WHERE org_id = ? AND search_id = ?
      ORDER BY CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, score DESC, name ASC`)
      .bind(orgId, searchId).all<LeadRow>();
    const leadRows = leadsResult.results ?? [];
    const evidenceResult = await this.db.prepare(`SELECT evidence.* FROM lead_radar_evidence evidence
      INNER JOIN lead_radar_companies company ON company.id = evidence.company_id
      WHERE evidence.org_id = ? AND company.org_id = ? AND company.search_id = ?
      ORDER BY evidence.company_id, evidence.field_path, evidence.id`)
      .bind(orgId, orgId, searchId).all<EvidenceRow>();
    const evidenceByLead = new Map<string, LeadRadarEvidence[]>();
    for (const row of evidenceResult.results ?? []) {
      const values = evidenceByLead.get(row.company_id) ?? [];
      values.push(mapEvidence(row));
      evidenceByLead.set(row.company_id, values);
    }
    return {
      search: mapSearch(search),
      leads: leadRows.map((row) => ({
        id: row.id,
        searchId: row.search_id,
        name: row.name,
        category: row.category,
        city: row.city,
        country: row.country,
        address: row.address,
        website: row.website,
        phone: row.phone,
        genericEmail: row.generic_email,
        telegramUrl: row.telegram_url,
        score: Number(row.score),
        confidence: Number(row.confidence),
        priority: row.priority,
        lifecycle: row.lifecycle,
        suppressed: row.suppressed === 1,
        scoreComponents: parseJson(row.score_components_json, []),
        signals: parseJson(row.signals_json, []),
        evidence: evidenceByLead.get(row.id) ?? [],
        discoveredAt: row.discovered_at,
        lastVerifiedAt: row.last_verified_at,
      })),
    };
  }

  async listOverview(orgId: string): Promise<LeadRadarOverview> {
    const searchesResult = await this.db.prepare(`SELECT * FROM lead_radar_searches
      WHERE org_id = ? ORDER BY created_at DESC, id DESC LIMIT 12`).bind(orgId).all<SearchRow>();
    const totals = await this.db.prepare(`SELECT
      (SELECT COUNT(*) FROM lead_radar_searches WHERE org_id = ?) AS searches,
      COUNT(*) AS leads,
      SUM(CASE WHEN priority = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN telegram_url IS NOT NULL THEN 1 ELSE 0 END) AS telegram,
      SUM(CASE WHEN lifecycle IN ('replied','qualified','meeting','won') THEN 1 ELSE 0 END) AS replies,
      SUM(CASE WHEN lifecycle IN ('qualified','meeting','won') THEN 1 ELSE 0 END) AS qualified
      FROM lead_radar_companies WHERE org_id = ?`).bind(orgId, orgId).first<Record<string, number | null>>();
    return {
      searches: (searchesResult.results ?? []).map(mapSearch),
      totals: {
        searches: Number(totals?.searches ?? 0),
        leads: Number(totals?.leads ?? 0),
        p1: Number(totals?.p1 ?? 0),
        telegram: Number(totals?.telegram ?? 0),
        replies: Number(totals?.replies ?? 0),
        qualified: Number(totals?.qualified ?? 0),
      },
      sourceHealth: [
        { source: 'OpenStreetMap', status: 'ready', note: 'Бесплатный discovery по категориям и географии' },
        { source: 'Сайты компаний', status: 'ready', note: 'Permission-first проверка контактов и сигналов' },
        { source: 'Открытые реестры', status: 'limited', note: 'Следующий коннектор — после проверки официального API' },
      ],
    };
  }

  async updateLifecycle(orgId: string, leadId: string, lifecycle: LeadRadarLifecycle, now: string): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_companies
      SET lifecycle = ?, suppressed = CASE WHEN ? = 'do_not_contact' THEN 1 ELSE suppressed END, updated_at = ?
      WHERE org_id = ? AND id = ?`).bind(lifecycle, lifecycle, now, orgId, leadId).run();
    return Number(result.meta.changes ?? 0) === 1;
  }
}
