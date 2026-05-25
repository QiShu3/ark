export const HOME_ONBOARDING_STORAGE_KEY = 'ark-home-onboarding-v1';
export const HOME_ONBOARDING_RESTART_EVENT = 'ark:onboarding-home-restart';

export const ONBOARDING_EVENTS = {
  primaryEventOpened: 'ark:onboarding-primary-event-opened',
  addEventOpened: 'ark:onboarding-add-event-opened',
  eventStoreOpened: 'ark:onboarding-event-store-opened',
  storeTemplateSelected: 'ark:onboarding-store-template-selected',
  storeTemplateSaved: 'ark:onboarding-store-template-saved',
  templateApplied: 'ark:onboarding-template-applied',
  eventCreated: 'ark:onboarding-event-created',
  eventOverviewClosed: 'ark:onboarding-event-overview-closed',
  arrangementsOpened: 'ark:onboarding-arrangements-opened',
  arrangementsClosed: 'ark:onboarding-arrangements-closed',
  workflowSettingsOpened: 'ark:onboarding-workflow-settings-opened',
  workflowSettingsClosed: 'ark:onboarding-workflow-settings-closed',
  workflowStarted: 'ark:onboarding-workflow-started',
  workflowPhaseEnded: 'ark:onboarding-workflow-phase-ended',
  workflowStopped: 'ark:onboarding-workflow-stopped',
} as const;

export type OnboardingEventName = (typeof ONBOARDING_EVENTS)[keyof typeof ONBOARDING_EVENTS];

export function dispatchOnboardingEvent(name: OnboardingEventName): void {
  window.dispatchEvent(new CustomEvent(name));
}

export function restartHomeOnboarding(): void {
  window.localStorage.removeItem(HOME_ONBOARDING_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(HOME_ONBOARDING_RESTART_EVENT));
}
