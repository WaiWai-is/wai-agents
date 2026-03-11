'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WaiAgentsApi } from '@/lib/api/services';
import type { IntegrationStatus } from '@/lib/types';
import { IntegrationCard } from './IntegrationCard';

type Props = {
  api: WaiAgentsApi;
};

export function IntegrationSettings({ api }: Props) {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingService, setConnectingService] = useState<string | null>(null);
  const popupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listIntegrations();
      setIntegrations(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  // Clean up popup polling interval on unmount
  useEffect(() => {
    return () => {
      if (popupIntervalRef.current) {
        clearInterval(popupIntervalRef.current);
        popupIntervalRef.current = null;
      }
    };
  }, []);

  async function handleConnect(service: string) {
    setConnectingService(service);
    setError(null);
    try {
      const res = await api.authorizeIntegration(service);
      const popup = window.open(res.authorize_url, `oauth-${service}`, 'width=600,height=700');
      if (!popup) {
        setError('Popup blocked. Please allow popups for this site.');
        setConnectingService(null);
        return;
      }
      if (popupIntervalRef.current) {
        clearInterval(popupIntervalRef.current);
      }
      popupIntervalRef.current = setInterval(() => {
        if (popup.closed) {
          if (popupIntervalRef.current) {
            clearInterval(popupIntervalRef.current);
            popupIntervalRef.current = null;
          }
          setConnectingService(null);
          void loadIntegrations();
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth flow');
      setConnectingService(null);
    }
  }

  async function handleDisconnect(service: string) {
    setError(null);
    try {
      await api.disconnectIntegration(service);
      void loadIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }

  return (
    <div className="is-settings">
      <h3 className="is-title">Integrations</h3>
      <p className="is-description">
        Connect third-party services to extend your agents with real-world capabilities.
      </p>

      {error && <p className="error-text">{error}</p>}

      {loading && (
        <div className="loading-spinner-container">
          <div className="loading-spinner" />
        </div>
      )}

      {!loading && integrations.length === 0 && (
        <p className="ab-empty-hint">No integrations available yet.</p>
      )}

      <div className="is-grid">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.service}
            integration={integration}
            onConnect={() => void handleConnect(integration.service)}
            onDisconnect={() => void handleDisconnect(integration.service)}
            connecting={connectingService === integration.service}
          />
        ))}
      </div>
    </div>
  );
}
