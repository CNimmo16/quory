export function siteSettings(value) {
  const domain = value?.trim().toLowerCase();
  if (
    !domain ||
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
  ) {
    throw new Error(
      "SITE_DOMAIN must be a hostname, without a protocol, port, or path.",
    );
  }
  return { SITE_DOMAIN: domain, SITE_URL: `https://${domain}` };
}
