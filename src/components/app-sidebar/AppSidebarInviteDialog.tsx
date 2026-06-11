import { Cloud, Copy, ExternalLink, RefreshCw, X } from "lucide-react";
import type { OemCloudReferralDashboard } from "@/lib/api/oemCloudControlPlane";
import { Modal } from "@/components/Modal";
import {
  InviteActionBar,
  InviteCodeBlock,
  InviteCodeLabel,
  InviteCodeMeta,
  InviteCodeValue,
  InviteDialogActionButton,
  InviteDialogBody,
  InviteDialogCloseButton,
  InviteDialogDescription,
  InviteDialogEyebrow,
  InviteDialogHeader,
  InviteDialogSurface,
  InviteDialogTitle,
  InviteMetaGrid,
  InviteMetaItem,
  InviteShareCard,
  InviteStatusCard,
} from "./AppSidebar.styles";

export interface AppSidebarInviteDialogCopy {
  closeLabel: string;
  eyebrowLabel: string;
  titleLabel: string;
  descriptionLabel: string;
  disconnectedLabel: string;
  connectAccountLabel: string;
  loadingLabel: string;
  retryLabel: string;
  codeLabel: string;
  copyLabel: string;
  downloadUrlLabel: string;
  landingUrlLabel: string;
  referrerRewardLabel: string;
  inviteeRewardLabel: string;
  copyShareTextLabel: string;
  copyLandingUrlLabel: string;
  copyCodeSuccessLabel: string;
  copyShareTextSuccessLabel: string;
  copyLandingUrlSuccessLabel: string;
}

interface AppSidebarInviteDialogProps {
  isOpen: boolean;
  hasCloudAccount: boolean;
  loading: boolean;
  error: string | null;
  dashboard: OemCloudReferralDashboard | null;
  copy: AppSidebarInviteDialogCopy;
  formatReferralCredits: (value: number | undefined) => string;
  onClose: () => void;
  onConnectAccount: () => void;
  onRetry: () => void;
  onCopyText: (value: string | undefined, successMessage: string) => void;
}

export function AppSidebarInviteDialog({
  isOpen,
  hasCloudAccount,
  loading,
  error,
  dashboard,
  copy,
  formatReferralCredits,
  onClose,
  onConnectAccount,
  onRetry,
  onCopyText,
}: AppSidebarInviteDialogProps) {
  const inviteShare = dashboard?.share;
  const invitePolicy = dashboard?.policy;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="p-0"
      maxWidth="max-w-xl"
      showCloseButton={false}
    >
      <InviteDialogSurface data-testid="app-sidebar-invite-dialog">
        <InviteDialogCloseButton
          type="button"
          aria-label={copy.closeLabel}
          onClick={onClose}
        >
          <X />
        </InviteDialogCloseButton>
        <InviteDialogHeader>
          <InviteDialogEyebrow>{copy.eyebrowLabel}</InviteDialogEyebrow>
          <InviteDialogTitle>{copy.titleLabel}</InviteDialogTitle>
          <InviteDialogDescription>
            {copy.descriptionLabel}
          </InviteDialogDescription>
        </InviteDialogHeader>

        <InviteDialogBody>
          {!hasCloudAccount ? (
            <InviteStatusCard>
              {copy.disconnectedLabel}
              <InviteActionBar style={{ marginTop: 10 }}>
                <InviteDialogActionButton
                  type="button"
                  $primary
                  onClick={onConnectAccount}
                >
                  <Cloud />
                  {copy.connectAccountLabel}
                </InviteDialogActionButton>
              </InviteActionBar>
            </InviteStatusCard>
          ) : null}

          {hasCloudAccount && loading ? (
            <InviteStatusCard>{copy.loadingLabel}</InviteStatusCard>
          ) : null}

          {hasCloudAccount && error ? (
            <InviteStatusCard $tone="error">
              {error}
              <InviteActionBar style={{ marginTop: 10 }}>
                <InviteDialogActionButton type="button" onClick={onRetry}>
                  <RefreshCw />
                  {copy.retryLabel}
                </InviteDialogActionButton>
              </InviteActionBar>
            </InviteStatusCard>
          ) : null}

          {hasCloudAccount && !loading && !error && dashboard ? (
            <InviteShareCard>
              <InviteCodeBlock>
                <InviteCodeMeta>
                  <InviteCodeLabel>{copy.codeLabel}</InviteCodeLabel>
                  <InviteCodeValue>{inviteShare?.code}</InviteCodeValue>
                </InviteCodeMeta>
                <InviteDialogActionButton
                  type="button"
                  onClick={() =>
                    onCopyText(inviteShare?.code, copy.copyCodeSuccessLabel)
                  }
                >
                  <Copy />
                  {copy.copyLabel}
                </InviteDialogActionButton>
              </InviteCodeBlock>

              <InviteMetaGrid>
                <InviteMetaItem>
                  <span>{copy.downloadUrlLabel}</span>
                  <strong>{inviteShare?.downloadUrl}</strong>
                </InviteMetaItem>
                <InviteMetaItem>
                  <span>{copy.landingUrlLabel}</span>
                  <strong>{inviteShare?.landingUrl}</strong>
                </InviteMetaItem>
                <InviteMetaItem>
                  <span>{copy.referrerRewardLabel}</span>
                  <strong>
                    {formatReferralCredits(
                      invitePolicy?.referrerRewardCredits,
                    )}
                  </strong>
                </InviteMetaItem>
                <InviteMetaItem>
                  <span>{copy.inviteeRewardLabel}</span>
                  <strong>
                    {formatReferralCredits(invitePolicy?.inviteeRewardCredits)}
                  </strong>
                </InviteMetaItem>
              </InviteMetaGrid>

              <InviteActionBar>
                <InviteDialogActionButton
                  type="button"
                  $primary
                  onClick={() =>
                    onCopyText(
                      inviteShare?.shareText,
                      copy.copyShareTextSuccessLabel,
                    )
                  }
                >
                  <Copy />
                  {copy.copyShareTextLabel}
                </InviteDialogActionButton>
                <InviteDialogActionButton
                  type="button"
                  onClick={() =>
                    onCopyText(
                      inviteShare?.landingUrl,
                      copy.copyLandingUrlSuccessLabel,
                    )
                  }
                >
                  <ExternalLink />
                  {copy.copyLandingUrlLabel}
                </InviteDialogActionButton>
              </InviteActionBar>
            </InviteShareCard>
          ) : null}
        </InviteDialogBody>
      </InviteDialogSurface>
    </Modal>
  );
}
