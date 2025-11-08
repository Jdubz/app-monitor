# Cloud Function Cleanup Plan

## Current State
Your GCP project (`static-sites-257923`) has many functions with issues:
- Multiple functions with "Unknown trigger" (not accessible)
- Duplicate functions (with and without `-staging` suffix)
- Inconsistent naming patterns

## Functions Currently in Use
Based on your list, only these functions have proper HTTP triggers:

### Production Functions (Active)
- ✅ `manageJobQueue` - https://managejobqueue-2v6dsoi5ha-uc.a.run.app
- ✅ `manageGenerator` - https://managegenerator-2v6dsoi5ha-uc.a.run.app
- ✅ `contact-form` - https://contact-form-2v6dsoi5ha-uc.a.run.app

### Staging Functions (Active)
- ✅ `manageJobQueue-staging` - https://managejobqueue-staging-2v6dsoi5ha-uc.a.run.app
- ✅ `manageGenerator-staging` - https://managegenerator-staging-2v6dsoi5ha-uc.a.run.app
- ✅ `contact-form-staging` - https://contact-form-staging-2v6dsoi5ha-uc.a.run.app

## Functions to Delete
All functions showing "Unknown trigger" should likely be deleted:

### Content Management (Unused/Broken)
- ❌ `createContentItem` - Unknown trigger
- ❌ `deleteContentItem-staging` - Unknown trigger
- ❌ `updateContentItem-staging` - Unknown trigger
- ❌ `updateContentItem` - Unknown trigger
- ❌ `getContentItem-staging` - Unknown trigger
- ❌ `listContentItems` - Unknown trigger

### Experience Management (Unused/Broken)
- ❌ `getExperience` - Unknown trigger
- ❌ `getExperience-staging` - Unknown trigger
- ❌ `deleteExperience` - Unknown trigger
- ❌ `updateExperience` - Unknown trigger
- ❌ `updateExperience-staging` - Unknown trigger
- ❌ `createExperience` - Unknown trigger
- ❌ `listExperiences` - Unknown trigger
- ❌ `listExperiences-staging` - Unknown trigger

### Document Generation (Unused/Broken)
- ❌ `generateDocument-staging` - Unknown trigger
- ❌ `generateDocument` - Unknown trigger
- ❌ `getGenerationRequest` - Unknown trigger
- ❌ `getGenerationResponse` - Unknown trigger

### Other (Unused/Broken)
- ❌ `handleContactForm` - Unknown trigger (superseded by `contact-form`)

## How to Delete Functions

### Option 1: Using Google Cloud Console
1. Go to https://console.cloud.google.com/functions/list?project=static-sites-257923
2. Select the functions you want to delete (use checkboxes)
3. Click "DELETE" button at the top
4. Confirm deletion

### Option 2: Using gcloud CLI
```bash
# Delete a single function
gcloud functions delete FUNCTION_NAME --region=us-central1 --project=static-sites-257923

# Delete multiple functions at once
gcloud functions delete \
  createContentItem \
  deleteContentItem-staging \
  updateContentItem-staging \
  updateContentItem \
  getContentItem-staging \
  listContentItems \
  getExperience \
  getExperience-staging \
  deleteExperience \
  updateExperience \
  updateExperience-staging \
  createExperience \
  listExperiences \
  listExperiences-staging \
  generateDocument-staging \
  generateDocument \
  getGenerationRequest \
  getGenerationResponse \
  handleContactForm \
  --region=us-central1 \
  --project=static-sites-257923 \
  --quiet
```

### Option 3: Use a Cleanup Script
Create a script to delete all unused functions:

```bash
#!/bin/bash
# cleanup-unused-functions.sh

PROJECT="static-sites-257923"
REGION="us-central1"

UNUSED_FUNCTIONS=(
  "createContentItem"
  "deleteContentItem-staging"
  "updateContentItem-staging"
  "updateContentItem"
  "getContentItem-staging"
  "listContentItems"
  "getExperience"
  "getExperience-staging"
  "deleteExperience"
  "updateExperience"
  "updateExperience-staging"
  "createExperience"
  "listExperiences"
  "listExperiences-staging"
  "generateDocument-staging"
  "generateDocument"
  "getGenerationRequest"
  "getGenerationResponse"
  "handleContactForm"
)

echo "This will delete ${#UNUSED_FUNCTIONS[@]} unused functions from $PROJECT"
echo "Functions to delete:"
printf '  - %s\n' "${UNUSED_FUNCTIONS[@]}"
echo ""
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" = "yes" ]; then
  for func in "${UNUSED_FUNCTIONS[@]}"; do
    echo "Deleting $func..."
    gcloud functions delete "$func" \
      --region="$REGION" \
      --project="$PROJECT" \
      --quiet || echo "Failed to delete $func"
  done
  echo "Cleanup complete!"
else
  echo "Cleanup cancelled"
fi
```

## After Cleanup
Once cleanup is complete:
1. Verify in Console that only the 6 active functions remain
2. Update app-monitor config if needed (currently already correct)
3. Test that staging and production environments show different logs

## Notes
- All unused functions have "Unknown trigger" which means they're not accessible anyway
- Deleting these will reduce clutter and potential confusion
- The app-monitor is now correctly configured to only show the active functions
- No impact on production since these functions aren't being called
