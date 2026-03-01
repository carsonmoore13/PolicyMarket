export function createGeoPoint(fields) {
  return {
    jurisdiction_name: fields.jurisdiction_name,
    lat: fields.lat,
    lng: fields.lng,
    geo_type: fields.geo_type,
    geo_source: fields.geo_source,
    bounding_box: fields.bounding_box ?? null,

    toDict() {
      return {
        jurisdiction_name: this.jurisdiction_name,
        lat: this.lat,
        lng: this.lng,
        geo_type: this.geo_type,
        geo_source: this.geo_source,
        bounding_box: this.bounding_box,
        geojson_point: {
          type: "Point",
          coordinates: [this.lng, this.lat],
        },
      };
    },
  };
}
