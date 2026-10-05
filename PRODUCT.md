# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a single administrator operating the WorkBuddy gateway, usually
from a desktop browser and occasionally from a mobile browser. The user monitors
account health, handles token and quota problems, runs batch maintenance, inspects
gateway traffic, and changes gateway configuration.

## Product Purpose

The console makes the workbuddy2api gateway observable and operable without editing
credential files or running routine maintenance commands by hand. Success means the
administrator can identify a problem, understand its impact, take the correct action,
and verify the result from one place.

## Positioning

It is a local operations surface for a multi-account gateway. It combines live account
pool state, credential health, batch task progress, request-level usage, pricing, and
gateway configuration while preserving direct access to the underlying files.

## Operating Context

- The console and gateway are separate services connected over HTTP.
- The gateway owns the request path and metrics; the console can read credential files
  and the gateway configuration from disk.
- Routine work is comparison-heavy and repeated: scan health, filter accounts, select
  rows, run batches, check whether failures are isolated, then refresh gateway state.
- Server flags can place the console in read-only mode or lock dangerous operations.
- The interface must remain useful when the gateway is unavailable; disk-derived facts
  should stay visible and runtime-only facts should be marked unavailable.

## Capabilities and Constraints

- Account list, filtering, selection, per-account operations, details, import, and delete.
- OAuth device-login flow and credential import fallback.
- Batch check-in, token refresh, travel, and credit queries with asynchronous progress.
- Per-model request, latency, throughput, token, cache, credit, pricing, and request-log views.
- Gateway configuration form and raw JSON editor with backup restore.
- System status, container status, restart, password change, and task history.
- OpenAI-compatible chat playground with stream and non-stream verification.
- Existing API contracts and backend behavior must remain unchanged.
- The source application is a React 18 + TypeScript + Vite web app with no existing
  product or visual identity document.

## Brand Commitments

The product name `WorkBuddy 控制台` and the gateway identity `workbuddy2api` are
confirmed. No logo, typeface, illustration, or color asset is established or binding.

## Evidence on Hand

The repository contains the complete functional UI, Go API client contracts, Chinese
interface copy, and existing responsive behavior. No approved visual references,
marketing claims, customer evidence, or brand asset files are present.

Assumption: with no earlier visual authority and a request for a full UI redesign,
the incumbent dark card interface is evidence of product function, not a brand direction
that must be preserved.

## Product Principles

1. Show operating state before explanatory prose.
2. Keep anomalies, recovery actions, and verification in the same visual context.
3. Favor dense, predictable tables and controls over decorative containers.
4. Make destructive and write operations legible before they are armed.
5. Preserve trust when services fail by distinguishing stale, unavailable, and healthy data.
