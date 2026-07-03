-- ========================================
-- XERA WITNESS LOOP / ORGANIC VIRALITY
-- ========================================
-- Tables for Proof Cards, witnesses, milestone validations,
-- inspired ARCs, collaboration slots and social-gravity events.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- A shareable card generated from a strong trace.
CREATE TABLE IF NOT EXISTS proof_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    title_snapshot TEXT,
    excerpt_snapshot TEXT,
    share_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    follow_count INTEGER NOT NULL DEFAULT 0,
    signup_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(arc_id, content_id)
);

-- Someone asked to witness a milestone or trace.
CREATE TABLE IF NOT EXISTS arc_witnesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
    milestone_content_id UUID REFERENCES content(id) ON DELETE SET NULL,
    witness_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    witness_email TEXT,
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'validated', 'declined')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    validated_at TIMESTAMP WITH TIME ZONE
);

-- A real validation made by a signed-in user.
CREATE TABLE IF NOT EXISTS arc_milestone_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE CASCADE,
    validator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    validation_type TEXT NOT NULL CHECK (validation_type IN ('witnessed', 'reviewed', 'approved')) DEFAULT 'witnessed',
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(content_id, validator_user_id)
);

-- Co-builder openings visible on an ARC.
CREATE TABLE IF NOT EXISTS arc_collaboration_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_label TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'filled', 'closed')) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- When someone starts their own ARC from another ARC.
CREATE TABLE IF NOT EXISTS arc_inspirations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
    new_arc_id UUID NOT NULL REFERENCES arcs(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_arc_id, new_arc_id)
);

-- Low-friction event stream for social gravity scoring.
CREATE TABLE IF NOT EXISTS social_growth_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    arc_id UUID REFERENCES arcs(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proof_cards_arc_id ON proof_cards(arc_id);
CREATE INDEX IF NOT EXISTS idx_proof_cards_content_id ON proof_cards(content_id);
CREATE INDEX IF NOT EXISTS idx_arc_witnesses_arc_id ON arc_witnesses(arc_id);
CREATE INDEX IF NOT EXISTS idx_arc_witnesses_token ON arc_witnesses(claim_token);
CREATE INDEX IF NOT EXISTS idx_arc_validations_arc_id ON arc_milestone_validations(arc_id);
CREATE INDEX IF NOT EXISTS idx_arc_validations_content_id ON arc_milestone_validations(content_id);
CREATE INDEX IF NOT EXISTS idx_arc_collab_slots_arc_id ON arc_collaboration_slots(arc_id);
CREATE INDEX IF NOT EXISTS idx_arc_inspirations_source ON arc_inspirations(source_arc_id);
CREATE INDEX IF NOT EXISTS idx_social_growth_events_arc_id ON social_growth_events(arc_id);
CREATE INDEX IF NOT EXISTS idx_social_growth_events_target ON social_growth_events(target_user_id);
CREATE INDEX IF NOT EXISTS idx_social_growth_events_created ON social_growth_events(created_at);

ALTER TABLE proof_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_witnesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_milestone_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_collaboration_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_inspirations ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_growth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proof cards are publicly readable" ON proof_cards
    FOR SELECT USING (true);

CREATE POLICY "Users can create proof cards for own arcs" ON proof_cards
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Proof card owners can update counters" ON proof_cards
    FOR UPDATE USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Witnesses are readable by involved users" ON arc_witnesses
    FOR SELECT USING (true);

CREATE POLICY "Users can request witnesses" ON arc_witnesses
    FOR INSERT WITH CHECK (auth.uid() = invited_by);

CREATE POLICY "Witness rows can be updated by involved users" ON arc_witnesses
    FOR UPDATE USING (auth.uid() = invited_by OR auth.uid() = witness_user_id)
    WITH CHECK (auth.uid() = invited_by OR auth.uid() = witness_user_id);

CREATE POLICY "Milestone validations are public proof" ON arc_milestone_validations
    FOR SELECT USING (true);

CREATE POLICY "Users can validate as themselves" ON arc_milestone_validations
    FOR INSERT WITH CHECK (auth.uid() = validator_user_id);

CREATE POLICY "Collaboration slots are public" ON arc_collaboration_slots
    FOR SELECT USING (true);

CREATE POLICY "Owners can open collaboration slots" ON arc_collaboration_slots
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update collaboration slots" ON arc_collaboration_slots
    FOR UPDATE USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "ARC inspirations are public" ON arc_inspirations
    FOR SELECT USING (true);

CREATE POLICY "Users can create inspired ARC links" ON arc_inspirations
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Social growth events are readable by authenticated users" ON social_growth_events
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can emit social growth events" ON social_growth_events
    FOR INSERT WITH CHECK (auth.uid() = actor_user_id OR actor_user_id IS NULL);

DROP TRIGGER IF EXISTS update_proof_cards_updated_at ON proof_cards;
CREATE TRIGGER update_proof_cards_updated_at BEFORE UPDATE ON proof_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_arc_collaboration_slots_updated_at ON arc_collaboration_slots;
CREATE TRIGGER update_arc_collaboration_slots_updated_at BEFORE UPDATE ON arc_collaboration_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
