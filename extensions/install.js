/**
 * uBlock Origin Extension Installer
 *
 * Downloads the latest uBlock Origin for Chromium from GitHub Releases
 * and extracts it into extensions/ublock/
 *
 * Usage: node extensions/install.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const EXTENSIONS_DIR = path.join(__dirname);
const UBLOCK_DIR = path.join(EXTENSIONS_DIR, 'ublock');
const TEMP_ZIP = path.join(EXTENSIONS_DIR, 'ublock-origin.zip');

const GITHUB_API = 'https://api.github.com/repos/AdonisLau/AdonisLau/releases/latest';
const GITHUB_RELEASES = 'https://api.github.com/repos/gorhill/uBlock/releases/latest';

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 'User-Agent': 'Aether-Browser/1.0' },
        };
        https.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpsGet(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function install() {
    // Check if already installed
    if (fs.existsSync(path.join(UBLOCK_DIR, 'manifest.json'))) {
        console.log('[uBlock] Already installed at', UBLOCK_DIR);
        return UBLOCK_DIR;
    }

    console.log('[uBlock] Fetching latest release info from GitHub...');

    // Step 1: Get latest release info
    const releaseData = await httpsGet(GITHUB_RELEASES);
    const release = JSON.parse(releaseData.toString());
    console.log(`[uBlock] Latest release: ${release.tag_name}`);

    // Step 2: Find the Chromium zip asset
    const asset = release.assets.find(
        (a) => a.name.includes('chromium') && a.name.endsWith('.zip')
    );

    if (!asset) {
        // Fallback: try any .zip
        const anyZip = release.assets.find((a) => a.name.endsWith('.zip'));
        if (!anyZip) {
            throw new Error('[uBlock] No chromium.zip found in release assets: ' +
                release.assets.map((a) => a.name).join(', '));
        }
        console.log(`[uBlock] Using fallback asset: ${anyZip.name}`);
        asset = anyZip;
    }

    console.log(`[uBlock] Downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)}MB)...`);

    // Step 3: Download the zip
    const zipData = await httpsGet(asset.browser_download_url);
    fs.writeFileSync(TEMP_ZIP, zipData);
    console.log('[uBlock] Download complete');

    // Step 4: Extract
    fs.mkdirSync(UBLOCK_DIR, { recursive: true });

    // Use macOS unzip
    execSync(`unzip -o "${TEMP_ZIP}" -d "${UBLOCK_DIR}"`, { stdio: 'inherit' });

    // Check if extracted into a subdirectory
    const contents = fs.readdirSync(UBLOCK_DIR);
    if (contents.length === 1 && fs.statSync(path.join(UBLOCK_DIR, contents[0])).isDirectory()) {
        // Move contents up one level
        const subDir = path.join(UBLOCK_DIR, contents[0]);
        const subContents = fs.readdirSync(subDir);
        for (const item of subContents) {
            fs.renameSync(path.join(subDir, item), path.join(UBLOCK_DIR, item));
        }
        fs.rmdirSync(subDir);
    }

    // Cleanup zip
    fs.unlinkSync(TEMP_ZIP);

    // Verify manifest exists
    if (!fs.existsSync(path.join(UBLOCK_DIR, 'manifest.json'))) {
        throw new Error('[uBlock] Installation failed — no manifest.json found');
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(UBLOCK_DIR, 'manifest.json'), 'utf-8'));
    console.log(`[uBlock] Installed v${manifest.version} (Manifest V${manifest.manifest_version})`);

    return UBLOCK_DIR;
}

// Run if called directly
if (require.main === module) {
    install()
        .then((dir) => console.log('[uBlock] Ready at:', dir))
        .catch((err) => {
            console.error('[uBlock] Installation failed:', err.message);
            process.exit(1);
        });
}

module.exports = { install, UBLOCK_DIR };
