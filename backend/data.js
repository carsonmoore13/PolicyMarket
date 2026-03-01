// Minimal seed data for PolicyMarket API.
// This can be replaced later with a real database.

const localities = [
  {
    id: 'austin-78705',
    name: 'Austin, TX 78705',
    center: [30.2836, -97.7424],
    zoom: 12,
    candidates: [
      {
        lat: 30.2836,
        lng: -97.7424,
        name: 'Kirk Watson',
        office: 'Mayor of Austin',
        jurisdiction: 'Austin 78705',
        party: 'N',
        policies: [
          'Housing affordability and density',
          'Transportation and Project Connect'
        ]
      },
      {
        lat: 30.284,
        lng: -97.739,
        name: 'Gregorio Casar',
        office: 'City Council District 4',
        jurisdiction: 'Austin',
        party: 'N',
        policies: [
          'Tenant protections and displacement',
          'Criminal justice and police oversight'
        ]
      }
    ]
  },
  {
    id: 'dallas',
    name: 'Dallas, TX',
    center: [32.7767, -96.7970],
    zoom: 11,
    candidates: [
      {
        lat: 32.7767,
        lng: -96.797,
        name: 'Eric Johnson',
        office: 'Mayor of Dallas',
        jurisdiction: 'Dallas',
        party: 'N',
        policies: [
          'Public safety and police reform',
          'Economic development and housing'
        ]
      }
    ]
  },
  {
    id: 'houston',
    name: 'Houston, TX',
    center: [29.7604, -95.3698],
    zoom: 11,
    candidates: [
      {
        lat: 29.7604,
        lng: -95.3698,
        name: 'John Whitmire',
        office: 'Mayor of Houston',
        jurisdiction: 'Houston',
        party: 'N',
        policies: [
          'Public safety and fire department',
          'Infrastructure and flooding'
        ]
      }
    ]
  },
  {
    id: 'san-antonio',
    name: 'San Antonio, TX',
    center: [29.4241, -98.4936],
    zoom: 11,
    candidates: [
      {
        lat: 29.4241,
        lng: -98.4936,
        name: 'Ron Nirenberg',
        office: 'Mayor of San Antonio',
        jurisdiction: 'San Antonio',
        party: 'N',
        policies: [
          'Economic recovery and jobs',
          'Housing and affordability'
        ]
      }
    ]
  }
];

const nationalCandidates = [
  {
    lat: 38.9072,
    lng: -77.0369,
    name: 'Donald Trump',
    office: 'U.S. President',
    jurisdiction: 'National',
    party: 'R',
    policies: [
      'Border security and immigration enforcement',
      'Tax cuts and deregulation'
    ]
  },
  {
    lat: 34.0522,
    lng: -118.2437,
    name: 'Kamala Harris',
    office: 'U.S. President',
    jurisdiction: 'National',
    party: 'D',
    policies: [
      'Healthcare access and reproductive rights',
      'Climate and clean energy investment'
    ]
  }
];

const stateCandidates = [
  {
    lat: 30.2672,
    lng: -97.7431,
    name: 'Greg Abbott',
    office: 'Governor',
    jurisdiction: 'Texas',
    party: 'R',
    policies: [
      'Border security and state immigration enforcement',
      'Property tax relief and education funding'
    ]
  },
  {
    lat: 29.7604,
    lng: -95.3698,
    name: 'Ken Paxton',
    office: 'Attorney General',
    jurisdiction: 'Texas',
    party: 'R',
    policies: [
      'State litigation and federal challenges',
      'Consumer protection and fraud enforcement'
    ]
  }
];

module.exports = {
  localities,
  nationalCandidates,
  stateCandidates
};

