use napi_derive::napi;
use std::collections::HashSet;
use url::Url;

/// High-performance ad & tracker blocking engine.
/// Stores blocked domains in a HashSet for O(1) lookup.
/// Checks the hostname and all parent domains (e.g. ads.example.com -> example.com).
#[napi]
pub struct ShieldEngine {
    blocked: HashSet<String>,
}

#[napi]
impl ShieldEngine {
    /// Create a new ShieldEngine pre-loaded with known ad/tracker domains.
    #[napi(constructor)]
    pub fn new() -> Self {
        let domains: Vec<&str> = vec![
            // ── Google Ads & Analytics ──
            "doubleclick.net",
            "google-analytics.com",
            "googleadservices.com",
            "googlesyndication.com",
            "googletagmanager.com",
            "googletagservices.com",
            "adservice.google.com",
            "pagead2.googlesyndication.com",
            // ── Facebook / Meta Tracking ──
            "facebook.com/tr",
            "connect.facebook.net",
            "pixel.facebook.com",
            "graph.facebook.com",
            // ── Ad Networks ──
            "adnxs.com",
            "adsrvr.org",
            "amazon-adsystem.com",
            "moatads.com",
            "serving-sys.com",
            "rubiconproject.com",
            "pubmatic.com",
            "openx.net",
            "criteo.com",
            "criteo.net",
            "outbrain.com",
            "taboola.com",
            "casalemedia.com",
            // ── Analytics & Fingerprinting ──
            "hotjar.com",
            "fullstory.com",
            "mixpanel.com",
            "segment.io",
            "segment.com",
            "amplitude.com",
            "quantserve.com",
            "scorecardresearch.com",
            // ── Trackers ──
            "adform.net",
            "rlcdn.com",
            "demdex.net",
            "krxd.net",
            "bluekai.com",
            "exelator.com",
            "turn.com",
            "mathtag.com",
            "contextweb.com",
            "bidswitch.net",
            "agkn.com",
            // ── Social Trackers ──
            "ads-twitter.com",
            "analytics.twitter.com",
            "static.ads-twitter.com",
            "t.co", // Twitter redirect tracker
            "snap.licdn.com",
            "analytics.tiktok.com",
        ];

        let blocked: HashSet<String> = domains.iter().map(|d| d.to_lowercase()).collect();

        ShieldEngine { blocked }
    }

    /// Check if a URL should be blocked.
    /// Parses the URL, extracts the hostname, and walks up the domain hierarchy.
    /// Returns true if any level matches a blocked domain.
    #[napi]
    pub fn should_block(&self, raw_url: String) -> bool {
        let host = match Url::parse(&raw_url) {
            Ok(parsed) => match parsed.host_str() {
                Some(h) => h.to_lowercase(),
                None => return false,
            },
            Err(_) => return false,
        };

        // Also check the full URL path for path-based rules (e.g. facebook.com/tr)
        let bare_host = host.strip_prefix("www.").unwrap_or(&host);
        let path = match Url::parse(&raw_url) {
            Ok(parsed) => {
                let p = parsed.path().trim_end_matches('/');
                if p.is_empty() {
                    String::new()
                } else {
                    format!("{}{}", bare_host, p)
                }
            }
            Err(_) => String::new(),
        };

        // Check full host+path first (e.g. "facebook.com/tr")
        if !path.is_empty() && self.blocked.contains(&path) {
            return true;
        }

        // Walk up the domain hierarchy: ads.example.com -> example.com
        let parts: Vec<&str> = bare_host.split('.').collect();
        for i in 0..parts.len() {
            let candidate = parts[i..].join(".");
            if self.blocked.contains(&candidate) {
                return true;
            }
        }

        false
    }

    /// Return the number of domains in the blocked set.
    #[napi]
    pub fn domain_count(&self) -> u32 {
        self.blocked.len() as u32
    }

    /// Add a custom domain to the block list at runtime.
    #[napi]
    pub fn add_domain(&mut self, domain: String) {
        self.blocked.insert(domain.to_lowercase());
    }

    /// Remove a domain from the block list at runtime.
    #[napi]
    pub fn remove_domain(&mut self, domain: String) -> bool {
        self.blocked.remove(&domain.to_lowercase())
    }
}
