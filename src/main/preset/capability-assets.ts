/**
 * Capability assets — SKILL.md content for every capability package.
 *
 * Inlined at build time via Vite's `?raw`, same approach as `bodies.ts`. Nothing
 * reads these files from disk at runtime — `materialiseCapabilities` (Task 14) writes
 * this content into a project's `.claude/capabilities/<id>/SKILL.md` at session start,
 * which is what lets `resolveCapabilityRefs` (Task 7) find them and the assembled
 * prompt reference them via `@`-lines that Claude Code expands (Task 9, Fall A).
 */

// Architect
import archAdrFormatGuide from './architect/capabilities/adr-format-guide/SKILL.md?raw'
import archAnforderungspaketFormulierer from './architect/capabilities/anforderungspaket-formulierer/SKILL.md?raw'
import archArchitectCoreIdentity from './architect/capabilities/architect-core-identity/SKILL.md?raw'
import archCoachingLoopGuide from './architect/capabilities/coaching-loop-guide/SKILL.md?raw'
import archNiveauCFormulierer from './architect/capabilities/niveau-c-formulierer/SKILL.md?raw'
import archSubsystemZerlegungGuide from './architect/capabilities/subsystem-zerlegung-guide/SKILL.md?raw'

// Cyber Factory
import cfCfCoreIdentity from './cyber-factory/capabilities/cf-core-identity/SKILL.md?raw'
import cfGraphNavigation from './cyber-factory/capabilities/graph-navigation/SKILL.md?raw'
import cfModelRoutingGuide from './cyber-factory/capabilities/model-routing-guide/SKILL.md?raw'
import cfRiskReviewGuide from './cyber-factory/capabilities/risk-review-guide/SKILL.md?raw'
import cfRueckwegProtokoll from './cyber-factory/capabilities/rueckweg-protokoll/SKILL.md?raw'
import cfWellePlanGranularisierer from './cyber-factory/capabilities/welle-plan-granularisierer/SKILL.md?raw'
import cfWellePlanGuide from './cyber-factory/capabilities/welle-plan-guide/SKILL.md?raw'
import cfWorkerStartupProtokoll from './cyber-factory/capabilities/worker-startup-protokoll/SKILL.md?raw'

// Systems Engineer
import seGateUrteilGuide from './systems-engineer/capabilities/gate-urteil-guide/SKILL.md?raw'
import seGraphNavigationAdvanced from './systems-engineer/capabilities/graph-navigation-advanced/SKILL.md?raw'
import seHandoffLogikGuide from './systems-engineer/capabilities/handoff-logik-guide/SKILL.md?raw'
import seSeCoreIdentity from './systems-engineer/capabilities/se-core-identity/SKILL.md?raw'
import seSteuerUeberblickTool from './systems-engineer/capabilities/steuer-ueberblick-tool/SKILL.md?raw'
import seTriggerZeigerFormat from './systems-engineer/capabilities/trigger-zeiger-format/SKILL.md?raw'

// Workshop
import wsCompletenessGate from './workshop/capabilities/completeness-gate/SKILL.md?raw'
import wsDebuggerBeauftragung from './workshop/capabilities/debugger-beauftragung/SKILL.md?raw'
import wsFindingsLesen from './workshop/capabilities/findings-lesen/SKILL.md?raw'
import wsItemDispatch from './workshop/capabilities/item-dispatch/SKILL.md?raw'
import wsStatusKonsolidierung from './workshop/capabilities/status-konsolidierung/SKILL.md?raw'
import wsWorkerMonitoring from './workshop/capabilities/worker-monitoring/SKILL.md?raw'

// Shared
import sharedRollingSummary from './shared/capabilities/rolling-summary/SKILL.md?raw'

/** Capability id -> SKILL.md content. Consumed by materialiseCapabilities (Task 14). */
export const CAPABILITY_SKILLS: Record<string, string> = {
  'adr-format-guide': archAdrFormatGuide,
  'anforderungspaket-formulierer': archAnforderungspaketFormulierer,
  'architect-core-identity': archArchitectCoreIdentity,
  'coaching-loop-guide': archCoachingLoopGuide,
  'niveau-c-formulierer': archNiveauCFormulierer,
  'subsystem-zerlegung-guide': archSubsystemZerlegungGuide,
  'cf-core-identity': cfCfCoreIdentity,
  'graph-navigation': cfGraphNavigation,
  'model-routing-guide': cfModelRoutingGuide,
  'risk-review-guide': cfRiskReviewGuide,
  'rueckweg-protokoll': cfRueckwegProtokoll,
  'welle-plan-granularisierer': cfWellePlanGranularisierer,
  'welle-plan-guide': cfWellePlanGuide,
  'worker-startup-protokoll': cfWorkerStartupProtokoll,
  'gate-urteil-guide': seGateUrteilGuide,
  'graph-navigation-advanced': seGraphNavigationAdvanced,
  'handoff-logik-guide': seHandoffLogikGuide,
  'se-core-identity': seSeCoreIdentity,
  'steuer-ueberblick-tool': seSteuerUeberblickTool,
  'trigger-zeiger-format': seTriggerZeigerFormat,
  'completeness-gate': wsCompletenessGate,
  'debugger-beauftragung': wsDebuggerBeauftragung,
  'findings-lesen': wsFindingsLesen,
  'item-dispatch': wsItemDispatch,
  'status-konsolidierung': wsStatusKonsolidierung,
  'worker-monitoring': wsWorkerMonitoring,
  'rolling-summary': sharedRollingSummary,
}

