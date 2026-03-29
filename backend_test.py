import requests
import sys
import json
from datetime import datetime

class PaperReadingAPITester:
    def __init__(self, base_url="https://word-context-lookup.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_paper_id = None
        self.created_bookmark_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = requests.post(url, data=data, files=files, headers=headers)
                elif data:
                    if isinstance(data, dict) and 'title' in data and 'content' in data:
                        # FormData for paper creation
                        response = requests.post(url, data=data, headers=headers)
                    else:
                        # JSON for other endpoints
                        headers['Content-Type'] = 'application/json'
                        response = requests.post(url, json=data, headers=headers)
                else:
                    response = requests.post(url, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and 'id' in response_data:
                        print(f"   Response ID: {response_data['id']}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health(self):
        """Test health endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health",
            200
        )
        return success

    def test_create_paper_text(self):
        """Test creating paper with text content"""
        test_data = {
            "title": "Test Paper - AI Context Lookup",
            "content": "Artificial intelligence has revolutionized many fields. Machine learning algorithms can process vast amounts of data to identify patterns and make predictions. Natural language processing enables computers to understand and generate human language. Deep learning networks use multiple layers to learn complex representations."
        }
        
        success, response = self.run_test(
            "Create Paper (Text)",
            "POST",
            "papers",
            200,
            data=test_data
        )
        
        if success and response.get('id'):
            self.created_paper_id = response['id']
            print(f"   Created paper ID: {self.created_paper_id}")
        
        return success

    def test_list_papers(self):
        """Test listing papers"""
        success, response = self.run_test(
            "List Papers",
            "GET",
            "papers",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} papers")
            if len(response) > 0:
                print(f"   First paper: {response[0].get('title', 'No title')}")
        
        return success

    def test_get_paper(self):
        """Test getting specific paper"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        success, response = self.run_test(
            "Get Paper by ID",
            "GET",
            f"papers/{self.created_paper_id}",
            200
        )
        
        if success:
            print(f"   Paper title: {response.get('title', 'No title')}")
            print(f"   Content length: {len(response.get('content', ''))}")
        
        return success

    def test_word_lookup(self):
        """Test word lookup with AI explanation"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        lookup_data = {
            "word": "algorithms",
            "context": "Machine learning algorithms can process vast amounts of data to identify patterns and make predictions",
            "paper_id": self.created_paper_id
        }
        
        success, response = self.run_test(
            "Word Lookup (AI Explanation)",
            "POST",
            "lookup",
            200,
            data=lookup_data
        )
        
        if success:
            print(f"   Word: {response.get('word', 'N/A')}")
            print(f"   Explanation length: {len(response.get('explanation', ''))}")
            print(f"   Cached: {response.get('cached', False)}")
            print(f"   Fingerprint: {response.get('fingerprint', 'N/A')}")
        
        return success

    def test_word_lookup_cache(self):
        """Test word lookup caching (same lookup should return cached=true)"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        lookup_data = {
            "word": "algorithms",
            "context": "Machine learning algorithms can process vast amounts of data to identify patterns and make predictions",
            "paper_id": self.created_paper_id
        }
        
        success, response = self.run_test(
            "Word Lookup (Cache Test)",
            "POST",
            "lookup",
            200,
            data=lookup_data
        )
        
        if success:
            cached = response.get('cached', False)
            print(f"   Cached result: {cached}")
            if cached:
                print("✅ Caching is working correctly")
            else:
                print("⚠️  Expected cached result but got fresh lookup")
        
        return success

    def test_create_bookmark(self):
        """Test creating a bookmark"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        bookmark_data = {
            "word": "algorithms",
            "context": "Machine learning algorithms can process vast amounts of data to identify patterns and make predictions",
            "explanation": "Algorithms are step-by-step procedures or formulas for solving problems, particularly in machine learning where they process data to identify patterns.",
            "paper_id": self.created_paper_id,
            "paper_title": "Test Paper - AI Context Lookup"
        }
        
        success, response = self.run_test(
            "Create Bookmark",
            "POST",
            "bookmarks",
            200,
            data=bookmark_data
        )
        
        if success and response.get('id'):
            self.created_bookmark_id = response['id']
            print(f"   Created bookmark ID: {self.created_bookmark_id}")
        
        return success

    def test_list_bookmarks(self):
        """Test listing bookmarks"""
        success, response = self.run_test(
            "List Bookmarks",
            "GET",
            "bookmarks",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} bookmarks")
            if len(response) > 0:
                print(f"   First bookmark word: {response[0].get('word', 'No word')}")
        
        return success

    def test_delete_bookmark(self):
        """Test deleting a bookmark"""
        if not self.created_bookmark_id:
            print("❌ Skipped - No bookmark ID available")
            return False
            
        success, response = self.run_test(
            "Delete Bookmark",
            "DELETE",
            f"bookmarks/{self.created_bookmark_id}",
            200
        )
        
        return success

    def test_paper_cache_batch(self):
        """Test batch cache endpoint for a paper"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        success, response = self.run_test(
            "Get Paper Cache (Batch)",
            "GET",
            f"lookup/paper-cache/{self.created_paper_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} cached entries for paper")
            if len(response) > 0:
                print(f"   First cached word: {response[0].get('word', 'No word')}")
                print(f"   All entries marked as cached: {all(entry.get('cached', False) for entry in response)}")
        
        return success

    def test_rhetorical_intent(self):
        """Test rhetorical intent analysis"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        rhetorical_data = {
            "word": "revolutionized",
            "sentence": "Artificial intelligence has revolutionized many fields.",
            "context": "Artificial intelligence has revolutionized many fields. Machine learning algorithms can process vast amounts of data to identify patterns and make predictions.",
            "paper_id": self.created_paper_id
        }
        
        success, response = self.run_test(
            "Rhetorical Intent Analysis",
            "POST",
            "rhetorical",
            200,
            data=rhetorical_data
        )
        
        if success:
            print(f"   Word: {response.get('word', 'N/A')}")
            print(f"   Analysis length: {len(response.get('analysis', ''))}")
            print(f"   Cached: {response.get('cached', False)}")
            print(f"   Fingerprint: {response.get('fingerprint', 'N/A')}")
        
        return success

    def test_rhetorical_cache(self):
        """Test rhetorical intent caching"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        rhetorical_data = {
            "word": "revolutionized",
            "sentence": "Artificial intelligence has revolutionized many fields.",
            "context": "Artificial intelligence has revolutionized many fields. Machine learning algorithms can process vast amounts of data to identify patterns and make predictions.",
            "paper_id": self.created_paper_id
        }
        
        success, response = self.run_test(
            "Rhetorical Intent (Cache Test)",
            "POST",
            "rhetorical",
            200,
            data=rhetorical_data
        )
        
        if success:
            cached = response.get('cached', False)
            print(f"   Cached result: {cached}")
            if cached:
                print("✅ Rhetorical caching is working correctly")
            else:
                print("⚠️  Expected cached result but got fresh analysis")
        
        return success

    def test_assumptions_analysis(self):
        """Test assumption stress-test analysis"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        assumptions_data = {
            "sentence": "Machine learning algorithms can process vast amounts of data to identify patterns and make predictions.",
            "context": "Artificial intelligence has revolutionized many fields. Machine learning algorithms can process vast amounts of data to identify patterns and make predictions. Natural language processing enables computers to understand and generate human language.",
            "paper_id": self.created_paper_id
        }
        
        success, response = self.run_test(
            "Assumptions Stress-Test Analysis",
            "POST",
            "assumptions",
            200,
            data=assumptions_data
        )
        
        if success:
            print(f"   Sentence analyzed: {response.get('sentence', 'N/A')[:50]}...")
            print(f"   Analysis length: {len(response.get('analysis', ''))}")
            print(f"   Cached: {response.get('cached', False)}")
            print(f"   Fingerprint: {response.get('fingerprint', 'N/A')}")
        
        return success

    def test_assumptions_cache(self):
        """Test assumptions analysis caching"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        assumptions_data = {
            "sentence": "Machine learning algorithms can process vast amounts of data to identify patterns and make predictions.",
            "context": "Artificial intelligence has revolutionized many fields. Machine learning algorithms can process vast amounts of data to identify patterns and make predictions. Natural language processing enables computers to understand and generate human language.",
            "paper_id": self.created_paper_id
        }
        
        success, response = self.run_test(
            "Assumptions Analysis (Cache Test)",
            "POST",
            "assumptions",
            200,
            data=assumptions_data
        )
        
        if success:
            cached = response.get('cached', False)
            print(f"   Cached result: {cached}")
            if cached:
                print("✅ Assumptions caching is working correctly")
            else:
                print("⚠️  Expected cached result but got fresh analysis")
        
        return success

    def test_rhetorical_paper_cache(self):
        """Test batch rhetorical cache endpoint for a paper"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        success, response = self.run_test(
            "Get Rhetorical Paper Cache (Batch)",
            "GET",
            f"rhetorical/paper-cache/{self.created_paper_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} cached rhetorical entries for paper")
            if len(response) > 0:
                print(f"   First cached word: {response[0].get('word', 'No word')}")
                print(f"   All entries marked as cached: {all(entry.get('cached', False) for entry in response)}")
        
        return success

    def test_assumptions_paper_cache(self):
        """Test batch assumptions cache endpoint for a paper"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        success, response = self.run_test(
            "Get Assumptions Paper Cache (Batch)",
            "GET",
            f"assumptions/paper-cache/{self.created_paper_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} cached assumptions entries for paper")
            if len(response) > 0:
                print(f"   First cached sentence: {response[0].get('sentence', 'No sentence')[:50]}...")
                print(f"   All entries marked as cached: {all(entry.get('cached', False) for entry in response)}")
        
        return success

    def test_delete_paper(self):
        """Test deleting a paper"""
        if not self.created_paper_id:
            print("❌ Skipped - No paper ID available")
            return False
            
        success, response = self.run_test(
            "Delete Paper",
            "DELETE",
            f"papers/{self.created_paper_id}",
            200
        )
        
        return success

def main():
    print("🚀 Starting Paper Reading App API Tests")
    print("=" * 50)
    
    tester = PaperReadingAPITester()
    
    # Run all tests in sequence
    tests = [
        tester.test_health,
        tester.test_create_paper_text,
        tester.test_list_papers,
        tester.test_get_paper,
        tester.test_word_lookup,
        tester.test_word_lookup_cache,
        tester.test_paper_cache_batch,
        tester.test_rhetorical_intent,
        tester.test_rhetorical_cache,
        tester.test_rhetorical_paper_cache,
        tester.test_assumptions_analysis,
        tester.test_assumptions_cache,
        tester.test_assumptions_paper_cache,
        tester.test_create_bookmark,
        tester.test_list_bookmarks,
        tester.test_delete_bookmark,
        tester.test_delete_paper,
    ]
    
    for test in tests:
        test()
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())