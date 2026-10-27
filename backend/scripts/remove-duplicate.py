with open('src/routes/kgb.routes.ts', 'r', encoding='utf8') as f:
    lines = f.readlines()

# Remove the old duplicate reminders/generate section (lines 242-295, 1-indexed)
# That's indices 241-294 in 0-indexed
# Keep lines 0-240 and 296+

# Find the exact lines to remove
# The old function starts with "router.post('/reminders/generate'" at line 242
# and ends with "});" at line 295

# Let's find the index
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if i >= 240 and 'router.post' in line and 'reminders/generate' in line and start_idx is None:
        start_idx = i
    if start_idx is not None and i > start_idx and line.rstrip().endswith('});'):
        # Check if this is the old function's closing
        # Look backwards to confirm it's the right one
        end_idx = i + 1  # include the line itself
        break

if start_idx is None or end_idx is None:
    print("Could not find duplicate section, keeping original")
else:
    print(f"Removing lines {start_idx+1} to {end_idx} (1-indexed)")
    new_lines = lines[:start_idx] + lines[end_idx:]
    with open('src/routes/kgb.routes.ts', 'w', encoding='utf8') as f:
        f.writelines(new_lines)
    print(f"File now has {len(new_lines)} lines")