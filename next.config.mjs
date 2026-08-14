/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Every kretivco.com subdomain below is the same Vercel deployment as
   * os.kretivco.com — one project, one database, one set of environment
   * variables. Each rewrite only changes what that host's root "/" shows;
   * every other path still resolves normally under any of these hosts, the
   * same as it always has on kretivos.vercel.app. These are front doors for
   * convenience, not access boundaries — actual access is still whatever the
   * page itself checks (HR's session redirect, HRMS_AUTH_ENABLED, and so on).
   *
   * sales.kretivco.com     -> /sales, the CRM and sales-document workspace.
   * marketing.kretivco.com -> Marketing Studio, which has no route of its own
   *                           and only exists as a view on the root page.
   * hr.kretivco.com        -> /hr, the HR team's admin workspace.
   * staff.kretivco.com     -> /hr/app, the employee self-service app.
   *
   * os.kretivco.com carries no rewrite: its root already is the Command
   * Centre, which is what "main" means here.
   */
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "sales.kretivco.com" }], destination: "/sales?tab=overview" },
        { source: "/", has: [{ type: "host", value: "marketing.kretivco.com" }], destination: "/?view=Marketing%20Studio" },
        { source: "/", has: [{ type: "host", value: "hr.kretivco.com" }], destination: "/hr" },
        { source: "/", has: [{ type: "host", value: "staff.kretivco.com" }], destination: "/hr/app" },
      ],
    };
  },
};
export default nextConfig;
