import { HNSWIndex } from './lib/hnsw';
import { cosineSimilarity } from './lib/vector';

const output = document.getElementById('output')!;

function log(msg: string, type: 'info' | 'pass' | 'fail' = 'info') {
  const div = document.createElement('div');
  div.textContent = msg;
  if (type === 'pass') div.className = 'pass';
  if (type === 'fail') div.className = 'fail';
  if (type === 'info' && msg.startsWith('===')) div.className = 'group';
  output.appendChild(div);
}

function assert(condition: boolean, msg: string) {
  if (condition) {
    log(`PASS: ${msg}`, 'pass');
  } else {
    log(`FAIL: ${msg}`, 'fail');
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertClose(a: number, b: number, epsilon = 1e-5, msg: string) {
  if (Math.abs(a - b) < epsilon) {
    log(`PASS: ${msg}`, 'pass');
  } else {
    log(`FAIL: ${msg} (Expected ${a}, got ${b})`, 'fail');
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// --- Tests ---

async function testCosineSimilarity() {
  log('=== Testing Cosine Similarity ===');
  const v1 = [1, 0, 0];
  const v2 = [1, 0, 0];
  const v3 = [0, 1, 0];
  const v4 = [0.70710678, 0.70710678, 0]; // 45 degrees

  assertClose(cosineSimilarity(v1, v2), 1.0, 1e-5, 'Identical vectors should be 1.0');
  assertClose(cosineSimilarity(v1, v3), 0.0, 1e-5, 'Orthogonal vectors should be 0.0');
  assertClose(cosineSimilarity(v1, v4), 0.70710678, 1e-5, '45 degree vectors');
}

async function testHNSWBasic() {
  log('=== Testing HNSW Basic Operations ===');
  const index = new HNSWIndex({ M: 16, efConstruction: 200, efSearch: 50 });
  
  // Add 3 points
  // A: [1, 0]
  // B: [0, 1]
  // C: [0.9, 0.1] -> Close to A
  
  index.addPoint('A', [1, 0]);
  index.addPoint('B', [0, 1]);
  index.addPoint('C', [0.9, 0.1]);
  
  // Search for [1, 0] -> Should find A first, then C
  const results = index.search([1, 0], 3);
  
  assert(results.length === 3, 'Should return 3 results');
  assert(results[0].id === 'A', 'First result should be A');
  assert(results[1].id === 'C', 'Second result should be C');
  assert(results[2].id === 'B', 'Third result should be B');
  
  assertClose(results[0].score, 1.0, 1e-4, 'Score for A should be 1.0');
}

function generateRandomVector(dim: number): number[] {
  const v: number[] = [];
  for(let i=0; i<dim; i++) v.push(Math.random() - 0.5);
  return v;
}

async function testHNSWvsBruteForce() {
  log('=== Testing HNSW vs Brute Force (Random Data) ===');
  const DIM = 32;
  const COUNT = 500;
  const TOP_K = 10;
  
  const index = new HNSWIndex({ M: 16, efConstruction: 100, efSearch: 50 });
  const vectors: { id: string, vec: number[] }[] = [];
  
  // 1. Generate Data
  for(let i=0; i<COUNT; i++) {
    const vec = generateRandomVector(DIM);
    const id = `doc_${i}`;
    vectors.push({ id, vec });
    index.addPoint(id, vec);
  }
  
  log(`Indexed ${COUNT} vectors of dimension ${DIM}`);
  
  // 2. Generate Query
  const query = generateRandomVector(DIM);
  
  // 3. Run HNSW Search
  const hnswResults = index.search(query, TOP_K);
  
  // 4. Run Brute Force Search
  const bfResults = vectors.map(doc => ({
    id: doc.id,
    score: cosineSimilarity(query, doc.vec)
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, TOP_K);
  
  // 5. Compare
  // We check recall: how many of the top K brute force results are in HNSW results
  const hnswIds = new Set(hnswResults.map(r => r.id));
  let matches = 0;
  for(const res of bfResults) {
    if (hnswIds.has(res.id)) matches++;
  }
  
  const recall = matches / TOP_K;
  log(`Recall: ${matches}/${TOP_K} (${(recall * 100).toFixed(1)}%)`);
  
  assert(recall >= 0.8, 'Recall should be at least 80%');
  
  // Check score accuracy of the top match found
  if (hnswResults.length > 0 && bfResults.length > 0) {
      const topHnswScore = hnswResults[0].score;
      const topBfScore = bfResults[0].score;
      log(`Top HNSW Score: ${topHnswScore.toFixed(4)}`);
      log(`Top BF Score:   ${topBfScore.toFixed(4)}`);
      assertClose(topHnswScore, topBfScore, 0.05, 'Top scores should be close');
  }
}

async function run() {
  try {
    await testCosineSimilarity();
    await testHNSWBasic();
    await testHNSWvsBruteForce();
    log('=== ALL TESTS PASSED ===', 'pass');
  } catch (e) {
    console.error(e);
    log(`TEST SUITE FAILED: ${e}`, 'fail');
  }
}

run();
