# Test Focus Work Admin Tool

## Summary
Added an admin-only test focus work page for testing the interaction between focus work and content banks.

## Changes

### Backend
- **Database**: Added `test_focus_configs` table to store test configurations
- **API Endpoints**:
  - `GET /api/admin/content-banks-for-type` - List available banks by focus work type
  - `GET /api/admin/test-focus-configs` - List user's test configurations
  - `POST /api/admin/test-focus-configs` - Create a test configuration
  - `DELETE /api/admin/test-focus-configs/{config_id}` - Delete a test configuration
  - `POST /api/todo/focus/workflow/start-test-focus` - Start test focus work with countup timer

### Frontend
- **New Page**: `TestFocusWork.tsx` - Admin-only page for managing and starting test focus work
- **Route**: Added `/#/test-focus` route in admin section
- **Navigation**: Added "测试专注工作" card in AppCenter (admin-only)

## Features
1. **Create Test Configurations**:
   - Select focus work type (vocab_today, erc_review, erc_practice)
   - Select corresponding content bank
   - Set target count (words/questions)
   - Configurations are persisted in database

2. **Start Focus Work**:
   - Click "启动" to start focus work with selected configuration
   - Uses countup timer (从 0 开始计时)
   - No break phase (only focus phase)
   - Focus work uses existing focus work system with `is_temporary: true`

3. **Supported Focus Work Types**:
   - `vocab_today` - Vocabulary flashcard learning with FSRS
   - `erc_review` - Weighted mistake review
   - `erc_practice` - Article reading + multiple choice questions

## Testing
- Backend: 102 tests passed
- Frontend: 250 tests passed (8 skipped)
- TypeScript type check: passed
- ESLint: passed (pre-existing warnings only)

## Files Changed
- `backend/routes/todo/db.py` - Added test_focus_configs table
- `backend/routes/todo/routes.py` - Added start-test-focus endpoint
- `backend/routes/admin_routes.py` - Added CRUD endpoints for test configs
- `frontend/src/pages/TestFocusWork.tsx` - New admin page
- `frontend/src/main.tsx` - Added route
- `frontend/src/pages/AppCenter.tsx` - Added navigation entry
