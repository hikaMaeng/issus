-- Q1/Q2 read acceleration only. No fact, queue, baseline or projection data changes.
CREATE INDEX alias_registry_listing ON issus.alias(owner_id,folded_name COLLATE "C");
CREATE INDEX issue_listing_updated ON issus.issue(repo_id,is_open,updated_at,number);
CREATE INDEX comment_participating_aliases ON issus.comment USING gin (
 (ARRAY[lower(split_part(envelope->>'FROM','/',1)),nullif(lower(envelope->>'TO'),'all')]
  || string_to_array(lower(coalesce(envelope->>'CC','')),','))
) WHERE validity='v2';
CREATE INDEX claim_alias_open ON issus.claim(owner_id,alias_id) WHERE released_by_comment_id IS NULL;
