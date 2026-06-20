import {
  Check,
  ChevronRight,
  ExternalLink,
  Info,
  KeyRound,
  Languages,
  LogIn,
  LogOut,
} from "lucide-react";
import type { ReactElement } from "react";
import type { SidebarNavItemDefinition } from "@/lib/navigation/sidebarNav";
import type { LocalePreference } from "@/i18n/locales";
import { APP_SIDEBAR_LANGUAGE_OPTIONS } from "./AppSidebar.constants";
import {
  AccountMenuAnchor,
  AccountMenuDivider,
  AccountMenuItem,
  AccountMenuItemGroup,
  AccountMenuItemLeading,
  AccountMenuItemTrailing,
  AccountMenuList,
  AccountMenuNotice,
  AccountMenuPopover,
  AccountPlanActionButton,
  AccountPlanActions,
  AccountPlanBadge,
  AccountPlanButton,
  AccountPlanCard,
  AccountPlanDetail,
  AccountPlanDetailsPill,
  AccountPlanHeader,
  AccountPlanMeta,
  AccountPlanProgressFill,
  AccountPlanProgressTrack,
  AccountPlanTitle,
  AccountPlanUsage,
  AccountSubmenuItem,
  AccountSubmenuItemHint,
  AccountSubmenuItemLabel,
  AccountSubmenuItemText,
  AccountSubmenuPopover,
  AccountSubmenuTitle,
} from "./AppSidebar.styles";

export interface AppSidebarAccountPlanSummary {
  planLabel: string;
  usageLabel: string | null;
  usagePercent: number | null;
}

export interface AppSidebarAccountMenuCopy {
  menuLabel: string;
  viewPlanDetailsLabel: string;
  viewDetailsLabel: string;
  loginPromptTitleLabel: string;
  loginPromptDescriptionLabel: string;
  loginPromptBadgeLabel: string;
  connectCloudLabel: string;
  loginPendingLabel: string;
  modelSettingsLabel: string;
  interfaceLanguageLabel: string;
  selectLanguageLabel: string;
  languageMenuLabel: string;
  currentLanguageLabel: string;
  userCenterLabel: string;
  aboutLabel: string;
  logoutLabel: string;
  logoutPendingLabel: string;
  formatSwitchLanguageAria: (language: string) => string;
}

interface AppSidebarAccountMenuProps {
  collapsed: boolean;
  trigger: ReactElement;
  accountMenuOpen: boolean;
  languageMenuOpen: boolean;
  accountMetaLine: string;
  hasCloudAccount: boolean;
  accountPlanSummary: AppSidebarAccountPlanSummary;
  accountLoginPending: boolean;
  accountLoginError: string | null;
  accountLogoutPending: boolean;
  language: LocalePreference;
  navItems: SidebarNavItemDefinition[];
  copy: AppSidebarAccountMenuCopy;
  isNavItemActive: (item: SidebarNavItemDefinition) => boolean;
  onNavigateItem: (item: SidebarNavItemDefinition) => void;
  onToggleLanguageMenu: () => void;
  onLanguageChange: (language: LocalePreference) => void;
  onOpenBilling: () => void;
  onLogin: () => void;
  onOpenModelSettings: () => void;
  onOpenUserCenter: () => void;
  onOpenAbout: () => void;
  onLogout: () => void;
}

export function AppSidebarAccountMenu({
  collapsed,
  trigger,
  accountMenuOpen,
  languageMenuOpen,
  accountMetaLine,
  hasCloudAccount,
  accountPlanSummary,
  accountLoginPending,
  accountLoginError,
  accountLogoutPending,
  language,
  navItems,
  copy,
  isNavItemActive,
  onNavigateItem,
  onToggleLanguageMenu,
  onLanguageChange,
  onOpenBilling,
  onLogin,
  onOpenModelSettings,
  onOpenUserCenter,
  onOpenAbout,
  onLogout,
}: AppSidebarAccountMenuProps) {
  return (
    <AccountMenuAnchor $collapsed={collapsed}>
      {trigger}
      {accountMenuOpen ? (
        <AccountMenuPopover
          $collapsed={collapsed}
          role="dialog"
          aria-label={copy.menuLabel}
          data-testid="app-sidebar-account-menu"
        >
          {hasCloudAccount ? (
            <AccountPlanButton
              type="button"
              aria-label={copy.viewPlanDetailsLabel}
              data-testid="app-sidebar-cloud-account-card"
              onClick={onOpenBilling}
            >
              <AccountPlanHeader>
                <AccountPlanTitle>
                  {accountPlanSummary.planLabel}
                </AccountPlanTitle>
                <AccountPlanDetailsPill>
                  {copy.viewDetailsLabel}
                  <ChevronRight />
                </AccountPlanDetailsPill>
              </AccountPlanHeader>
              {accountPlanSummary.usageLabel ? (
                <>
                  <AccountPlanUsage>
                    {accountPlanSummary.usageLabel}
                  </AccountPlanUsage>
                  <AccountPlanProgressTrack aria-hidden="true">
                    <AccountPlanProgressFill
                      $percent={accountPlanSummary.usagePercent}
                    />
                  </AccountPlanProgressTrack>
                </>
              ) : null}
              <AccountPlanMeta>{accountMetaLine}</AccountPlanMeta>
            </AccountPlanButton>
          ) : (
            <AccountPlanCard data-testid="app-sidebar-login-card">
              <AccountPlanHeader>
                <AccountPlanTitle>
                  <span>{copy.loginPromptTitleLabel}</span>
                </AccountPlanTitle>
                <AccountPlanBadge>
                  {copy.loginPromptBadgeLabel}
                </AccountPlanBadge>
              </AccountPlanHeader>
              <AccountPlanDetail>
                <span>{copy.loginPromptDescriptionLabel}</span>
              </AccountPlanDetail>
              <AccountPlanActions>
                <AccountPlanActionButton
                  type="button"
                  $primary
                  disabled={accountLoginPending}
                  aria-label={copy.connectCloudLabel}
                  onClick={onLogin}
                >
                  <LogIn />
                  {accountLoginPending
                    ? copy.loginPendingLabel
                    : copy.connectCloudLabel}
                </AccountPlanActionButton>
              </AccountPlanActions>
              {accountLoginError ? (
                <AccountMenuNotice $tone="error">
                  {accountLoginError}
                </AccountMenuNotice>
              ) : null}
            </AccountPlanCard>
          )}

          <AccountMenuList>
            {navItems.map((item) => {
              const AccountNavIcon = item.icon;
              const active = isNavItemActive(item);

              return (
                <AccountMenuItem
                  key={item.id}
                  type="button"
                  $active={active}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigateItem(item)}
                >
                  <AccountMenuItemLeading>
                    <AccountNavIcon />
                    {item.label}
                  </AccountMenuItemLeading>
                  <ChevronRight />
                </AccountMenuItem>
              );
            })}
            <AccountMenuItemGroup>
              <AccountMenuItem
                type="button"
                $active={languageMenuOpen}
                aria-label={copy.languageMenuLabel}
                aria-expanded={languageMenuOpen}
                aria-haspopup="menu"
                onClick={onToggleLanguageMenu}
              >
                <AccountMenuItemLeading>
                  <Languages />
                  {copy.languageMenuLabel}
                </AccountMenuItemLeading>
                <AccountMenuItemTrailing>
                  {copy.currentLanguageLabel}
                  <ChevronRight />
                </AccountMenuItemTrailing>
              </AccountMenuItem>
              {languageMenuOpen ? (
                <AccountSubmenuPopover
                  role="menu"
                  aria-label={copy.selectLanguageLabel}
                  data-testid="app-sidebar-language-menu"
                >
                  <AccountSubmenuTitle>
                    {copy.interfaceLanguageLabel}
                  </AccountSubmenuTitle>
                  {APP_SIDEBAR_LANGUAGE_OPTIONS.map((option) => {
                    const active = option.id === language;

                    return (
                      <AccountSubmenuItem
                        key={option.id}
                        type="button"
                        $active={active}
                        role="menuitemradio"
                        aria-checked={active}
                        aria-label={copy.formatSwitchLanguageAria(option.label)}
                        onClick={() => onLanguageChange(option.id)}
                      >
                        <AccountSubmenuItemText>
                          <AccountSubmenuItemLabel>
                            {option.label}
                          </AccountSubmenuItemLabel>
                          <AccountSubmenuItemHint>
                            {option.hint}
                          </AccountSubmenuItemHint>
                        </AccountSubmenuItemText>
                        {active ? <Check /> : null}
                      </AccountSubmenuItem>
                    );
                  })}
                </AccountSubmenuPopover>
              ) : null}
            </AccountMenuItemGroup>
            <AccountMenuItem
              type="button"
              aria-label={copy.modelSettingsLabel}
              data-testid="app-sidebar-account-model-settings"
              onClick={onOpenModelSettings}
            >
              <AccountMenuItemLeading>
                <KeyRound />
                {copy.modelSettingsLabel}
              </AccountMenuItemLeading>
              <ChevronRight />
            </AccountMenuItem>
            {hasCloudAccount ? (
              <AccountMenuItem
                type="button"
                aria-label={copy.userCenterLabel}
                onClick={onOpenUserCenter}
              >
                <AccountMenuItemLeading>
                  <ExternalLink />
                  {copy.userCenterLabel}
                </AccountMenuItemLeading>
                <ChevronRight />
              </AccountMenuItem>
            ) : null}
            <AccountMenuItem
              type="button"
              aria-label={copy.aboutLabel}
              onClick={onOpenAbout}
            >
              <AccountMenuItemLeading>
                <Info />
                {copy.aboutLabel}
              </AccountMenuItemLeading>
              <ChevronRight />
            </AccountMenuItem>
            {hasCloudAccount ? (
              <>
                <AccountMenuDivider />
                <AccountMenuItem
                  type="button"
                  $danger
                  disabled={accountLogoutPending}
                  aria-label={copy.logoutLabel}
                  onClick={onLogout}
                >
                  <AccountMenuItemLeading>
                    <LogOut />
                    {accountLogoutPending
                      ? copy.logoutPendingLabel
                      : copy.logoutLabel}
                  </AccountMenuItemLeading>
                </AccountMenuItem>
              </>
            ) : null}
          </AccountMenuList>
        </AccountMenuPopover>
      ) : null}
    </AccountMenuAnchor>
  );
}
