use napi_derive::napi;
use adblock::engine::Engine;
use adblock::lists::{FilterSet, ParseOptions};
use adblock::request::Request;
use std::sync::Mutex;

/// Brave-grade ad & tracker blocking engine.
/// Uses Brave's adblock-rust crate for full EasyList/uBlock Origin filter support,
/// cosmetic filtering, and $exception / $redirect rules.
#[napi]
pub struct ShieldEngine {
    engine: Mutex<Engine>,
    filter_count: u32,
}

/// Result of a network block check
#[napi(object)]
pub struct BlockResult {
    pub blocked: bool,
    pub redirect: Option<String>,
    pub exception: Option<String>,
}

/// Result of a cosmetic filter check
#[napi(object)]
pub struct CosmeticResult {
    pub hide_selectors: Vec<String>,
    pub style_selectors: Vec<String>,
    pub injected_script: String,
}

/// Hardcoded fallback domain block list (used if no filter lists loaded)
const FALLBACK_DOMAINS: &[&str] = &[
    // Google Ads & Analytics
    "||doubleclick.net^",
    "||google-analytics.com^",
    "||googleadservices.com^",
    "||googlesyndication.com^",
    "||googletagmanager.com^",
    "||googletagservices.com^",
    "||adservice.google.com^",
    "||pagead2.googlesyndication.com^",
    // Facebook / Meta Tracking
    "||connect.facebook.net^",
    "||pixel.facebook.com^",
    "||graph.facebook.com^",
    // Ad Networks
    "||adnxs.com^",
    "||adsrvr.org^",
    "||amazon-adsystem.com^",
    "||moatads.com^",
    "||serving-sys.com^",
    "||rubiconproject.com^",
    "||pubmatic.com^",
    "||openx.net^",
    "||criteo.com^",
    "||criteo.net^",
    "||outbrain.com^",
    "||taboola.com^",
    "||casalemedia.com^",
    // Analytics & Fingerprinting
    "||hotjar.com^",
    "||fullstory.com^",
    "||mixpanel.com^",
    "||segment.io^",
    "||segment.com^",
    "||amplitude.com^",
    "||quantserve.com^",
    "||scorecardresearch.com^",
    // Trackers
    "||adform.net^",
    "||rlcdn.com^",
    "||demdex.net^",
    "||krxd.net^",
    "||bluekai.com^",
    "||exelator.com^",
    "||turn.com^",
    "||mathtag.com^",
    "||contextweb.com^",
    "||bidswitch.net^",
    "||agkn.com^",
    // Social Trackers
    "||ads-twitter.com^",
    "||analytics.twitter.com^",
    "||static.ads-twitter.com^",
    "||snap.licdn.com^",
    "||analytics.tiktok.com^",
    // YouTube Ads
    "||youtube.com/get_midroll_^",
    "||youtube.com/pagead/^",
    "||youtube.com/ptracking^",
    "||youtube.com/api/stats/ads^",
    "||youtube.com/api/stats/atr^",
    // General YouTube cosmetic
    "youtube.com##ytd-banner-promo-renderer",
    "youtube.com##ytd-in-feed-ad-layout-renderer",
    "youtube.com##ytd-promoted-sparkles-web-renderer",
    "youtube.com##ytd-display-ad-renderer",
    "youtube.com##ytd-ad-slot-renderer",
    "youtube.com###masthead-ad",
    "youtube.com##.ytp-ad-overlay-container",
    "youtube.com##ytd-promoted-sparkles-text-search-renderer",
    "youtube.com##ytd-mealbar-promo-renderer",
    "youtube.com##.ytd-merch-shelf-renderer",
    "youtube.com##ytd-engagement-panel-section-list-renderer[target-id=\"engagement-panel-ads\"]",
];

#[napi]
impl ShieldEngine {
    /// Create a new ShieldEngine with embedded fallback filters.
    #[napi(constructor)]
    pub fn new() -> Self {
        let mut filter_set = FilterSet::new(true);
        let rules: Vec<String> = FALLBACK_DOMAINS.iter().map(|s| s.to_string()).collect();
        filter_set.add_filters(&rules, ParseOptions::default());

        let engine = Engine::from_filter_set(filter_set, true);

        ShieldEngine {
            filter_count: FALLBACK_DOMAINS.len() as u32,
            engine: Mutex::new(engine),
        }
    }

    /// Load filter lists (EasyList, uBlock, etc.) from raw text.
    /// Each entry in `filter_texts` is the raw content of a filter list file.
    /// Returns the total number of filters loaded.
    #[napi]
    pub fn load_filter_lists(&mut self, filter_texts: Vec<String>) -> u32 {
        let mut filter_set = FilterSet::new(true);

        // Always include fallback domains
        let fallback: Vec<String> = FALLBACK_DOMAINS.iter().map(|s| s.to_string()).collect();
        filter_set.add_filters(&fallback, ParseOptions::default());

        let mut count = fallback.len();

        for text in &filter_texts {
            let rules: Vec<String> = text
                .lines()
                .filter(|line| {
                    let trimmed = line.trim();
                    !trimmed.is_empty() && !trimmed.starts_with('!') && !trimmed.starts_with('[')
                })
                .map(|s| s.to_string())
                .collect();
            count += rules.len();
            filter_set.add_filters(&rules, ParseOptions::default());
        }

        let engine = Engine::from_filter_set(filter_set, true);
        *self.engine.lock().unwrap() = engine;
        self.filter_count = count as u32;
        self.filter_count
    }

    /// Check if a URL should be blocked.
    /// `source_url` is the page that initiated the request.
    /// `request_type` is the resource type: "script", "image", "stylesheet", "xmlhttprequest", etc.
    #[napi]
    pub fn check_network_request(
        &self,
        url: String,
        source_url: String,
        request_type: String,
    ) -> BlockResult {
        let engine = self.engine.lock().unwrap();
        let request = match Request::new(&url, &source_url, &request_type) {
            Ok(r) => r,
            Err(_) => {
                return BlockResult {
                    blocked: false,
                    redirect: None,
                    exception: None,
                };
            }
        };

        let result = engine.check_network_request(&request);

        BlockResult {
            blocked: result.matched,
            redirect: result.redirect.map(|r| r.to_string()),
            exception: result.exception.map(|e| e.to_string()),
        }
    }

    /// Legacy compatibility: simple boolean check.
    /// Wraps check_network_request for backward compatibility.
    #[napi]
    pub fn should_block(&self, raw_url: String) -> bool {
        let result = self.check_network_request(
            raw_url,
            String::new(),
            "other".to_string(),
        );
        result.blocked
    }

    /// Get cosmetic filters for a specific URL.
    /// Returns CSS selectors to hide and style rules to inject.
    #[napi]
    pub fn get_cosmetic_filters(&self, url: String) -> CosmeticResult {
        let engine = self.engine.lock().unwrap();

        // Extract hostname from URL for cosmetic filter lookup
        let _hostname = url
            .split("//")
            .nth(1)
            .unwrap_or("")
            .split('/')
            .next()
            .unwrap_or("");

        let cosmetic = engine.url_cosmetic_resources(&url);

        let hide_selectors: Vec<String> = cosmetic
            .hide_selectors
            .into_iter()
            .collect();

        let style_rules: Vec<String> = Vec::new();

        let injected_script = cosmetic.injected_script;

        CosmeticResult {
            hide_selectors,
            style_selectors: style_rules,
            injected_script,
        }
    }

    /// Return the number of filters loaded.
    #[napi]
    pub fn filter_count(&self) -> u32 {
        self.filter_count
    }

    /// Legacy alias for filter_count.
    #[napi]
    pub fn domain_count(&self) -> u32 {
        self.filter_count
    }

    /// Serialize the engine to a byte buffer for caching.
    #[napi]
    pub fn serialize(&self) -> Vec<u8> {
        let engine = self.engine.lock().unwrap();
        engine.serialize()
    }

    /// Deserialize the engine from a cached byte buffer.
    /// Returns true if successful.
    #[napi]
    pub fn deserialize(&mut self, data: Vec<u8>) -> bool {
        let mut engine = self.engine.lock().unwrap();
        engine.deserialize(&data).is_ok()
    }
}
