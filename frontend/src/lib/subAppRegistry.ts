export type {
  ContentBankType,
  TemplateSection,
  ContentConfigField,
  FocusWorkDeclaration,
  AppDeclaration as SubAppDeclaration,
} from './appRegistry';

export {
  appRegistry as subAppRegistry,
  appList as subAppList,
  getAppIcon as getSubAppIcon,
  loadAppRegistry as loadDynamicRegistry,
} from './appRegistry';

export type { AppDeclaration } from './appRegistry';
