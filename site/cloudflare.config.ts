// The landing page at dossier.victorc.dev: static assets only, no Worker code.
export default {
	worker: {
		name: "dossier-site",
		compatibilityDate: "2026-10-01",
		workersDev: false,
		previewUrls: false,
		observability: { enabled: false },
		domains: ["dossier.victorc.dev"],
		assets: { notFoundHandling: "404-page", htmlHandling: "auto-trailing-slash" },
	},
};
