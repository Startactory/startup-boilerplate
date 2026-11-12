import { describe, expect, it } from 'vitest';
import { checkLegalIdentity } from '../../scripts/check-legal-identity.mjs';

const company = {
  name: 'Acme SAS',
  form: 'SAS',
  address: '1 rue de Rivoli, 75001 Paris',
  siren: '123456789',
  publicationDirector: 'Ada Lovelace',
  mediator: 'Example consumer mediator, mediator.example.eu',
};

const legal = {
  termsVersion: '2026-11-12',
  founderName: 'Ada Lovelace',
  contactEmail: 'ada@example.com',
  company,
};

describe('checkLegalIdentity', () => {
  it('reports a missing company', () => {
    expect(checkLegalIdentity({ legal: { ...legal, company: null } })).toEqual({
      ok: false,
      missing: ['legal.company'],
    });
  });

  it('reports a missing legal block as a missing contact email and company', () => {
    expect(checkLegalIdentity({})).toEqual({
      ok: false,
      missing: ['legal.contactEmail', 'legal.company'],
    });
  });

  it('reports a company field that is absent or blank', () => {
    const result = checkLegalIdentity({
      legal: {
        ...legal,
        company: { ...company, siren: undefined, address: ' ' },
      },
    });
    expect(result).toEqual({
      ok: false,
      missing: ['legal.company.address', 'legal.company.siren'],
    });
  });

  it('requires the consumer mediator', () => {
    const { mediator: _mediator, ...withoutMediator } = company;
    expect(
      checkLegalIdentity({ legal: { ...legal, company: withoutMediator } }),
    ).toEqual({ ok: false, missing: ['legal.company.mediator'] });
  });

  it('reports a missing contact email', () => {
    expect(
      checkLegalIdentity({ legal: { ...legal, contactEmail: '' } }),
    ).toEqual({ ok: false, missing: ['legal.contactEmail'] });
  });

  it('accepts a micro-entrepreneur without RCS and VAT number', () => {
    expect(checkLegalIdentity({ legal })).toEqual({ ok: true });
  });
});
