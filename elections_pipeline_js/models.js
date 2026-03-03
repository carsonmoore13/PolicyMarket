import crypto from 'crypto';

export function computeHash(candidate) {
  const parts = [
    (candidate.name || '').toLowerCase().trim(),
    (candidate.office || '').toLowerCase().trim(),
    (candidate.office_level || '').toLowerCase().trim(),
    (candidate.jurisdiction || '').toLowerCase().trim(),
    (candidate.district || '').toLowerCase().trim(),
    (candidate.party || '').toLowerCase().trim(),
  ];
  const raw = parts.join('|');
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function createCandidate(fields) {
  const now = new Date();
  return {
    name: fields.name,
    office: fields.office,
    office_level: fields.office_level,
    jurisdiction: fields.jurisdiction,
    district: fields.district ?? null,
    party: fields.party ?? null,
    incumbent: fields.incumbent ?? null,
    filing_date: fields.filing_date ?? null,
    geo: fields.geo ?? null,
    // New enriched fields
    photo: fields.photo ?? {
      url: null,
      source: null,
      verified: false,
      last_fetched: null,
      fallback_initials: null,
    },
    zip_codes: Array.isArray(fields.zip_codes) ? fields.zip_codes : [],
    district_zip_map: fields.district_zip_map ?? {
      state: 'TX',
      district: fields.district ?? null,
      zip_codes: [],
    },
    source_url: fields.source_url ?? '',
    source_name: fields.source_name ?? '',
    last_verified: fields.last_verified ?? now,
    data_hash: fields.data_hash ?? '',
    created_at: fields.created_at ?? null,
    updated_at: fields.updated_at ?? null,
    source_candidate_id: fields.source_candidate_id ?? null,

    computeHash() {
      return computeHash(this);
    },

    toDict() {
      const now = new Date();
      const doc = {
        name: this.name,
        office: this.office,
        office_level: this.office_level,
        jurisdiction: this.jurisdiction,
        district: this.district,
        party: this.party,
        incumbent: this.incumbent,
        filing_date: this.filing_date,
        photo: this.photo || {
          url: null,
          source: null,
          verified: false,
          last_fetched: null,
          fallback_initials: null,
        },
        zip_codes: Array.isArray(this.zip_codes) ? this.zip_codes : [],
        district_zip_map:
          this.district_zip_map ??
          {
            state: 'TX',
            district: this.district ?? null,
            zip_codes: [],
          },
        source_url: this.source_url,
        source_name: this.source_name,
        last_verified: this.last_verified,
        data_hash: this.data_hash || this.computeHash(),
        created_at: this.created_at || now,
        updated_at: this.updated_at || now,
      };
      if (this.source_candidate_id != null) doc.source_candidate_id = this.source_candidate_id;
      doc.geo = this.geo ? (typeof this.geo.toDict === 'function' ? this.geo.toDict() : this.geo) : null;
      return doc;
    },
  };
}
