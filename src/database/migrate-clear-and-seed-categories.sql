-- =====================================================
-- MIGRATION: Clear old categories/topics & seed correct data
-- Run: psql -U admin -d arxvi-backend -f migrate-clear-and-seed-categories.sql
-- =====================================================

BEGIN;

-- 1. Remove foreign key constraints temporarily to allow clean delete
-- Deactivate all topics first, then delete all
DELETE FROM users_topics;            -- user preferences
DELETE FROM paper_topics;            -- paper <-> topic relations  
DELETE FROM topics;                  -- all topics
DELETE FROM categories;              -- all categories

-- 2. Seed Categories with correct human-readable names
INSERT INTO categories (code, title) VALUES
  ('cs',      'Computer Science'),
  ('math',    'Mathematics'),
  ('stat',    'Statistics'),
  ('physics', 'Physics'),
  ('astro-ph','Astrophysics'),
  ('cond-mat','Condensed Matter'),
  ('gr-qc',   'General Relativity and Quantum Cosmology'),
  ('hep-ex',  'High Energy Physics - Experiment'),
  ('hep-lat', 'High Energy Physics - Lattice'),
  ('hep-ph',  'High Energy Physics - Phenomenology'),
  ('hep-th',  'High Energy Physics - Theory'),
  ('math-ph', 'Mathematical Physics'),
  ('nlin',    'Nonlinear Sciences'),
  ('nucl-ex', 'Nuclear Experiment'),
  ('nucl-th', 'Nuclear Theory'),
  ('quant-ph','Quantum Physics'),
  ('econ',    'Economics'),
  ('eess',    'Electrical Engineering and Systems Science'),
  ('q-bio',   'Quantitative Biology'),
  ('q-fin',   'Quantitative Finance')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title;

-- 3. Seed Topics (Computer Science)
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('cs.AI',  'Artificial Intelligence',                    'cs'),
  ('cs.AR',  'Hardware Architecture',                      'cs'),
  ('cs.CC',  'Computational Complexity',                   'cs'),
  ('cs.CE',  'Computational Engineering',                  'cs'),
  ('cs.CG',  'Computational Geometry',                     'cs'),
  ('cs.CL',  'Computation and Language',                   'cs'),
  ('cs.CR',  'Cryptography and Security',                  'cs'),
  ('cs.CV',  'Computer Vision and Pattern Recognition',    'cs'),
  ('cs.CY',  'Computers and Society',                      'cs'),
  ('cs.DB',  'Databases',                                  'cs'),
  ('cs.DC',  'Distributed and Cluster Computing',          'cs'),
  ('cs.DL',  'Digital Libraries',                          'cs'),
  ('cs.DM',  'Discrete Mathematics',                       'cs'),
  ('cs.DS',  'Data Structures and Algorithms',             'cs'),
  ('cs.ET',  'Emerging Technologies',                      'cs'),
  ('cs.FL',  'Formal Languages and Automata Theory',       'cs'),
  ('cs.GL',  'General Literature',                         'cs'),
  ('cs.GR',  'Graphics',                                   'cs'),
  ('cs.GT',  'Computer Science and Game Theory',           'cs'),
  ('cs.HC',  'Human-Computer Interaction',                 'cs'),
  ('cs.IR',  'Information Retrieval',                      'cs'),
  ('cs.IT',  'Information Theory',                         'cs'),
  ('cs.LG',  'Machine Learning',                           'cs'),
  ('cs.LO',  'Logic in Computer Science',                  'cs'),
  ('cs.MA',  'Multiagent Systems',                         'cs'),
  ('cs.MM',  'Multimedia',                                 'cs'),
  ('cs.MS',  'Mathematical Software',                      'cs'),
  ('cs.NA',  'Numerical Analysis',                         'cs'),
  ('cs.NE',  'Neural and Evolutionary Computing',          'cs'),
  ('cs.NI',  'Networking and Internet Architecture',       'cs'),
  ('cs.OH',  'Other Computer Science',                     'cs'),
  ('cs.OS',  'Operating Systems',                          'cs'),
  ('cs.PF',  'Performance',                                'cs'),
  ('cs.PL',  'Programming Languages',                      'cs'),
  ('cs.RO',  'Robotics',                                   'cs'),
  ('cs.SC',  'Symbolic Computation',                       'cs'),
  ('cs.SD',  'Sound',                                      'cs'),
  ('cs.SE',  'Software Engineering',                       'cs'),
  ('cs.SI',  'Social and Information Networks',            'cs'),
  ('cs.SY',  'Systems and Control',                        'cs')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- 4. Math Topics
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('math.AC', 'Commutative Algebra',        'math'),
  ('math.AG', 'Algebraic Geometry',         'math'),
  ('math.AP', 'Analysis of PDEs',           'math'),
  ('math.AT', 'Algebraic Topology',         'math'),
  ('math.CA', 'Classical Analysis and ODEs','math'),
  ('math.CO', 'Combinatorics',              'math'),
  ('math.CT', 'Category Theory',            'math'),
  ('math.CV', 'Complex Variables',          'math'),
  ('math.DG', 'Differential Geometry',      'math'),
  ('math.DS', 'Dynamical Systems',          'math'),
  ('math.FA', 'Functional Analysis',        'math'),
  ('math.GM', 'General Mathematics',        'math'),
  ('math.GN', 'General Topology',           'math'),
  ('math.GR', 'Group Theory',               'math'),
  ('math.GT', 'Geometric Topology',         'math'),
  ('math.HO', 'History and Overview',       'math'),
  ('math.IT', 'Information Theory',         'math'),
  ('math.KT', 'K-Theory and Homology',      'math'),
  ('math.LO', 'Logic',                      'math'),
  ('math.MG', 'Metric Geometry',            'math'),
  ('math.MP', 'Mathematical Physics',       'math'),
  ('math.NA', 'Numerical Analysis',         'math'),
  ('math.NT', 'Number Theory',              'math'),
  ('math.OA', 'Operator Algebras',          'math'),
  ('math.OC', 'Optimization and Control',   'math'),
  ('math.PR', 'Probability',                'math'),
  ('math.QA', 'Quantum Algebra',            'math'),
  ('math.RA', 'Rings and Algebras',         'math'),
  ('math.RT', 'Representation Theory',      'math'),
  ('math.SG', 'Symplectic Geometry',        'math'),
  ('math.SP', 'Spectral Theory',            'math'),
  ('math.ST', 'Statistics Theory',          'math')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- 5. Statistics Topics
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('stat.AP', 'Applications',        'stat'),
  ('stat.CO', 'Computation',         'stat'),
  ('stat.ME', 'Methodology',         'stat'),
  ('stat.ML', 'Machine Learning',    'stat'),
  ('stat.OT', 'Other Statistics',    'stat'),
  ('stat.TH', 'Statistics Theory',   'stat')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- 6. Physics Topics
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('physics.acc-ph',   'Accelerator Physics',                    'physics'),
  ('physics.ao-ph',    'Atmospheric and Oceanic Physics',         'physics'),
  ('physics.app-ph',   'Applied Physics',                        'physics'),
  ('physics.atom-ph',  'Atomic Physics',                         'physics'),
  ('physics.bio-ph',   'Biological Physics',                     'physics'),
  ('physics.chem-ph',  'Chemical Physics',                       'physics'),
  ('physics.class-ph', 'Classical Physics',                      'physics'),
  ('physics.comp-ph',  'Computational Physics',                  'physics'),
  ('physics.data-an',  'Data Analysis, Statistics and Probability','physics'),
  ('physics.ed-ph',    'Physics Education',                      'physics'),
  ('physics.flu-dyn',  'Fluid Dynamics',                         'physics'),
  ('physics.gen-ph',   'General Physics',                        'physics'),
  ('physics.geo-ph',   'Geophysics',                             'physics'),
  ('physics.hist-ph',  'History and Philosophy of Physics',      'physics'),
  ('physics.ins-det',  'Instrumentation and Detectors',          'physics'),
  ('physics.med-ph',   'Medical Physics',                        'physics'),
  ('physics.optics',   'Optics',                                 'physics'),
  ('physics.plasm-ph', 'Plasma Physics',                         'physics'),
  ('physics.soc-ph',   'Physics and Society',                    'physics'),
  ('physics.space-ph', 'Space Physics',                          'physics')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- 7. Astrophysics Topics
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('astro-ph.CO', 'Cosmology and Nongalactic Astrophysics',        'astro-ph'),
  ('astro-ph.EP', 'Earth and Planetary Astrophysics',              'astro-ph'),
  ('astro-ph.GA', 'Astrophysics of Galaxies',                      'astro-ph'),
  ('astro-ph.HE', 'High Energy Astrophysical Phenomena',           'astro-ph'),
  ('astro-ph.IM', 'Instrumentation and Methods for Astrophysics',  'astro-ph'),
  ('astro-ph.SR', 'Solar and Stellar Astrophysics',                'astro-ph')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- 8. Condensed Matter Topics
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('cond-mat.dis-nn',  'Disordered Systems and Neural Networks', 'cond-mat'),
  ('cond-mat.mes-hall','Mesoscale and Nanoscale Physics',         'cond-mat'),
  ('cond-mat.mtrl-sci','Materials Science',                       'cond-mat'),
  ('cond-mat.other',   'Other Condensed Matter',                  'cond-mat'),
  ('cond-mat.quant-gas','Quantum Gases',                          'cond-mat'),
  ('cond-mat.soft',    'Soft Condensed Matter',                   'cond-mat'),
  ('cond-mat.stat-mech','Statistical Mechanics',                  'cond-mat'),
  ('cond-mat.str-el',  'Strongly Correlated Electrons',           'cond-mat'),
  ('cond-mat.supr-con','Superconductivity',                       'cond-mat')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- 9. Top-level single-code categories (no sub-code)
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('gr-qc',   'General Relativity and Quantum Cosmology',    'gr-qc'),
  ('hep-ex',  'High Energy Physics - Experiment',            'hep-ex'),
  ('hep-lat', 'High Energy Physics - Lattice',               'hep-lat'),
  ('hep-ph',  'High Energy Physics - Phenomenology',         'hep-ph'),
  ('hep-th',  'High Energy Physics - Theory',                'hep-th'),
  ('math-ph', 'Mathematical Physics',                        'math-ph'),
  ('quant-ph','Quantum Physics',                             'quant-ph'),
  ('nucl-ex', 'Nuclear Experiment',                          'nucl-ex'),
  ('nucl-th', 'Nuclear Theory',                              'nucl-th')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- 10. Nonlinear Sciences
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('nlin.AO', 'Adaptation and Self-Organizing Systems',     'nlin'),
  ('nlin.CD', 'Chaotic Dynamics',                           'nlin'),
  ('nlin.CG', 'Cellular Automata and Lattice Gases',        'nlin'),
  ('nlin.PS', 'Pattern Formation and Solitons',             'nlin'),
  ('nlin.SI', 'Exactly Solvable and Integrable Systems',    'nlin')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

-- 11. Economics, EESS, Q-Bio, Q-Fin
INSERT INTO topics (code, title, category_id, is_active)
SELECT t.code, t.title, c.id, true
FROM (VALUES
  ('econ.EM',  'Econometrics',              'econ'),
  ('econ.GN',  'General Economics',         'econ'),
  ('econ.TH',  'Theoretical Economics',     'econ'),
  ('eess.AS',  'Audio and Speech Processing','eess'),
  ('eess.IV',  'Image and Video Processing','eess'),
  ('eess.SP',  'Signal Processing',         'eess'),
  ('eess.SY',  'Systems and Control',       'eess'),
  ('q-bio.BM', 'Biomolecules',              'q-bio'),
  ('q-bio.CB', 'Cell Behavior',             'q-bio'),
  ('q-bio.GN', 'Genomics',                  'q-bio'),
  ('q-bio.MN', 'Molecular Networks',        'q-bio'),
  ('q-bio.NC', 'Neurons and Cognition',     'q-bio'),
  ('q-bio.OT', 'Other Quantitative Biology','q-bio'),
  ('q-bio.PE', 'Populations and Evolution', 'q-bio'),
  ('q-bio.QM', 'Quantitative Methods',      'q-bio'),
  ('q-bio.SC', 'Subcellular Processes',     'q-bio'),
  ('q-bio.TO', 'Tissues and Organs',        'q-bio'),
  ('q-fin.CP', 'Computational Finance',     'q-fin'),
  ('q-fin.EC', 'Economics',                 'q-fin'),
  ('q-fin.GN', 'General Finance',           'q-fin'),
  ('q-fin.MF', 'Mathematical Finance',      'q-fin'),
  ('q-fin.PM', 'Portfolio Management',      'q-fin'),
  ('q-fin.PR', 'Pricing of Securities',     'q-fin'),
  ('q-fin.RM', 'Risk Management',           'q-fin'),
  ('q-fin.ST', 'Statistical Finance',       'q-fin'),
  ('q-fin.TR', 'Trading and Market Microstructure','q-fin')
) AS t(code, title, cat_code)
JOIN categories c ON c.code = t.cat_code
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, is_active = true;

COMMIT;

-- Summary
SELECT 
  (SELECT COUNT(*) FROM categories) AS total_categories,
  (SELECT COUNT(*) FROM topics)     AS total_topics;
