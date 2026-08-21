# Project Guidelines

This document outlines the coding guidelines and best practices for contributing to the MyZ Annotator project. Please adhere to these standards to maintain code quality and consistency across the codebase.

## Use TypeScript for all code

All new code should be written in TypeScript to ensure type safety and improve maintainability.

## Check existing types and utilities

Reuse existing types and utility functions wherever possible to avoid duplication and ensure consistency.

## Schema-first data modeling

Update shared schemas/types first (e.g., `packages/shared/src/schemas.ts`, `packages/shared/src/types.ts`, via `@myz/shared`), then apply changes to storage and UI.

## Refactoring brutally and fearlessly

If you see code that can be improved, refactor it without hesitation. Clean and efficient code is a priority.

## Document new modules and functions

All new modules and functions should be well-documented with comments explaining their purpose and usage.

## Framework specific guidelines

- For Vue components, use the Composition API and JSX syntax.
- Follow Vue's best practices for state management and component design.
- Use Pinia for state management and ensure stores are modular and focused on single responsibilities.
- Ensure proper reactivity in Vue components by using `ref` and `computed` properties appropriately.
- Follow the established project structure for organizing files and directories.

## Testing

All new features and significant changes should include appropriate tests to ensure functionality and prevent regressions.

## AGENTS.md upkeep

If you change folder responsibilities or key flows, update the nearest `AGENTS.md` in the same scope.
