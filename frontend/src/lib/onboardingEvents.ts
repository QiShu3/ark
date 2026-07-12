export const FIRST_GUIDE_STORAGE_KEY = 'ark-first-guide-v1';
export const FIRST_GUIDE_RESTART_EVENT = 'ark:first-guide-restart';
export const GUEST_ONBOARDING_STORAGE_KEY = 'ark-guest-onboarding-v1';
export const GUEST_ONBOARDING_RESTART_EVENT = 'ark:guest-onboarding-restart';

export const FIRST_GUIDE_EVENTS = {
  primaryEventOpened: 'ark:first-guide-primary-event-opened',
  addEventOpened: 'ark:first-guide-add-event-opened',
  eventStoreOpened: 'ark:first-guide-event-store-opened',
  storeTemplateSelected: 'ark:first-guide-store-template-selected',
  storeTemplateSaved: 'ark:first-guide-store-template-saved',
  templateApplied: 'ark:first-guide-template-applied',
  eventCreated: 'ark:first-guide-event-created',
  eventOverviewClosed: 'ark:first-guide-event-overview-closed',
  arrangementsOpened: 'ark:first-guide-arrangements-opened',
  arrangementsClosed: 'ark:first-guide-arrangements-closed',
  workflowSettingsOpened: 'ark:first-guide-workflow-settings-opened',
  workflowSettingsClosed: 'ark:first-guide-workflow-settings-closed',
  workflowStarted: 'ark:first-guide-workflow-started',
  workflowPhaseEnded: 'ark:first-guide-workflow-phase-ended',
  workflowStopped: 'ark:first-guide-workflow-stopped',
} as const;

export const HOME_ONBOARDING_STORAGE_KEY = FIRST_GUIDE_STORAGE_KEY;
export const HOME_ONBOARDING_RESTART_EVENT = FIRST_GUIDE_RESTART_EVENT;
export const ONBOARDING_EVENTS = FIRST_GUIDE_EVENTS;

export type FirstGuideEventName = (typeof FIRST_GUIDE_EVENTS)[keyof typeof FIRST_GUIDE_EVENTS];
export type OnboardingEventName = FirstGuideEventName;

export function dispatchFirstGuideEvent(name: FirstGuideEventName): void {
  window.dispatchEvent(new CustomEvent(name));
}

export const dispatchOnboardingEvent = dispatchFirstGuideEvent;

export function restartFirstGuide(): void {
  window.localStorage.removeItem(FIRST_GUIDE_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(FIRST_GUIDE_RESTART_EVENT));
}

export function restartGuestOnboarding(userId: number): void {
  window.localStorage.removeItem(`${GUEST_ONBOARDING_STORAGE_KEY}:${userId}`);
  window.dispatchEvent(new CustomEvent(GUEST_ONBOARDING_RESTART_EVENT));
}

export const restartHomeOnboarding = restartFirstGuide;
