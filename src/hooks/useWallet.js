import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react';
import { BrowserProvider, formatEther } from 'ethers';
import { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────
//  WalletConnect Configuration
// ─────────────────────────────────────────────────────────────
//  Get a FREE project ID at: https://cloud.walletconnect.com
//  Replace 'YOUR_PROJECT_ID' with your actual project ID.
// ─────────────────────────────────────────────────────────────
const projectId = 'YOUR_PROJECT_ID';

const mainnet = {
    chainId: 1,
    name: 'Ethereum',
    currency: 'ETH',
    explorerUrl: 'https://etherscan.io',
    rpcUrl: 'https://cloudflare-eth.com',
};

const sepolia = {
    chainId: 11155111,
    name: 'Sepolia',
    currency: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrl: 'https://rpc.sepolia.org',
};

const polygon = {
    chainId: 137,
    name: 'Polygon',
    currency: 'MATIC',
    explorerUrl: 'https://polygonscan.com',
    rpcUrl: 'https://polygon-rpc.com',
};

const metadata = {
    name: 'Onyx Browser',
    description: 'AI-First Browser with Web3',
    url: 'https://onyx.browser',
    icons: ['https://avatars.githubusercontent.com/u/37784886'],
};

// Initialize Web3Modal once at module level
createWeb3Modal({
    ethersConfig: defaultConfig({ metadata }),
    chains: [mainnet, sepolia, polygon],
    projectId,
    enableAnalytics: false,
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#00f2ea',
        '--w3m-color-mix': '#050505',
        '--w3m-color-mix-strength': 40,
        '--w3m-border-radius-master': '2px',
    },
});

/**
 * useWallet — WalletConnect-powered wallet hook.
 *
 * Uses Web3Modal for connection (QR code, mobile wallets, injected).
 * Fetches balance + ENS via ethers.js BrowserProvider after connection.
 */
export function useWallet() {
    const { open } = useWeb3Modal();
    const { address, chainId, isConnected } = useWeb3ModalAccount();
    const { walletProvider } = useWeb3ModalProvider();

    const [balance, setBalance] = useState(null);
    const [ensName, setEnsName] = useState(null);
    const [error, setError] = useState(null);
    const fetchRef = useRef(0);

    // Fetch balance + ENS whenever address or chainId changes
    useEffect(() => {
        if (!isConnected || !walletProvider || !address) {
            setBalance(null);
            setEnsName(null);
            return;
        }

        const rid = ++fetchRef.current;

        (async () => {
            try {
                const provider = new BrowserProvider(walletProvider);
                const bal = await provider.getBalance(address);
                if (rid !== fetchRef.current) return;
                setBalance(formatEther(bal));

                // ENS lookup (mainnet only — gracefully fails on other chains)
                try {
                    const name = await provider.lookupAddress(address);
                    if (rid !== fetchRef.current) return;
                    setEnsName(name);
                } catch {
                    if (rid === fetchRef.current) setEnsName(null);
                }
            } catch (e) {
                if (rid === fetchRef.current) {
                    console.warn('[useWallet] Balance fetch error:', e.message);
                    setError(e.message);
                }
            }
        })();
    }, [address, chainId, isConnected, walletProvider]);

    // Shortened address: 0x1234…5678
    const shortAddress = address
        ? `${address.slice(0, 6)}…${address.slice(-4)}`
        : null;

    // Human-readable chain name
    const chainName = chainId
        ? {
            1: 'Ethereum',
            5: 'Goerli',
            11155111: 'Sepolia',
            137: 'Polygon',
            80001: 'Mumbai',
            42161: 'Arbitrum',
            10: 'Optimism',
            56: 'BSC',
            43114: 'Avalanche',
        }[chainId] || `Chain ${chainId}`
        : null;

    // Connect opens the Web3Modal (QR code + wallet options)
    const connect = async () => {
        setError(null);
        try {
            await open();
        } catch (e) {
            setError(e.message || 'Connection failed');
        }
    };

    // Disconnect opens the modal to the account view (has disconnect button)
    const disconnect = async () => {
        try {
            await open({ view: 'Account' });
        } catch { /* swallow */ }
    };

    return {
        account: address || null,
        shortAddress,
        balance,
        ensName,
        chainId,
        chainName,
        error,
        connecting: false, // Web3Modal handles its own loading states via its modal
        isConnected,
        connect,
        disconnect,
    };
}
