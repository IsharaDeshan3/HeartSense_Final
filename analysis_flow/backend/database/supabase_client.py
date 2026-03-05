"""

Supabase Client - Database Connection and Vector Operations

Uses direct requests to PostgREST API (no supabase SDK needed).
Replaces local FAISS with Supabase pgvector for real-time multi-user updates.

"""



import os

import json

import logging

import requests

from typing import List, Dict, Optional, Any, cast

from dataclasses import dataclass

from dotenv import load_dotenv, find_dotenv

import numpy as np



load_dotenv(find_dotenv())

logger = logging.getLogger(__name__)




# --------------------------------------------------------------------------- #
#  Lightweight PostgREST helper                                                #
# --------------------------------------------------------------------------- #

class _PostgREST:
    """Minimal wrapper around Supabase PostgREST endpoints using requests."""

    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/")
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    # -- table helpers -------------------------------------------------------

    def select(self, table: str, query_params: str = "", single: bool = False) -> Optional[Any]:
        url = f"{self.base}/rest/v1/{table}?{query_params}" if query_params else f"{self.base}/rest/v1/{table}"
        resp = requests.get(url, headers=self.headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if single:
            return data[0] if data else None
        return data

    def insert(self, table: str, row: Dict[str, Any]) -> List[Dict[str, Any]]:
        url = f"{self.base}/rest/v1/{table}"
        resp = requests.post(url, headers=self.headers, json=row, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def update(self, table: str, values: Dict[str, Any], eq_col: str, eq_val: str) -> None:
        url = f"{self.base}/rest/v1/{table}?{eq_col}=eq.{eq_val}"
        resp = requests.patch(url, headers=self.headers, json=values, timeout=30)
        resp.raise_for_status()

    def rpc(self, fn_name: str, params: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base}/rest/v1/rpc/{fn_name}"
        resp = requests.post(url, headers=self.headers, json=params or {}, timeout=30)
        resp.raise_for_status()
        return resp.json()


# --------------------------------------------------------------------------- #
#  Data class for search results                                               #
# --------------------------------------------------------------------------- #

@dataclass

class VectorSearchResult :

    """Result from vector similarity search"""

    id :str

    content :str

    similarity :float

    source_type :str

    created_at :str

    metadata :Optional [Dict [str ,Any ]]=None



class SupabaseClient :

    """

    Supabase client for medical knowledge base operations.

    Handles vector embeddings, user profiles, and feedback queue.

    """



    def __init__ (self ):

        """Initialize Supabase client from environment variables"""

        self .url =os .getenv ("SUPABASE_URL")

        self .key =os .getenv ("SUPABASE_ANON_KEY")

        self .service_key =os .getenv ("SUPABASE_SERVICE_KEY")



        if not self .url or not self .key :

            raise ValueError (

            "Supabase credentials not configured. "

            "Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables."

            )



        self .client = _PostgREST(self.url, self.key)



        if self .service_key :

            self .admin_client = _PostgREST(self.url, self.service_key)

        else :

            self .admin_client =self .client



        logger .info ("Supabase client initialized")




    def get_user_profile (self ,user_id :str ):

        """Get user profile by ID"""

        try :
            data = self.client.select("profiles", f"id=eq.{user_id}", single=True)
            return data

        except Exception as e :

            logger .error (f"Error fetching user profile: {e }")

            return None



    def get_user_role (self ,user_id :str ):

        """Get user's experience level/role"""

        try :
            data = self.client.select("profiles", f"id=eq.{user_id}&select=experience_level", single=True)
            return data.get("experience_level", "seasoned") if data else "seasoned"

        except Exception as e :

            logger .error (f"Error fetching user role: {e }")

            return "seasoned"



    def update_user_role (self ,user_id :str ,role :str ):

        """Update user role (admin only)"""

        if role not in ["newbie","seasoned","expert","admin"]:

            raise ValueError (f"Invalid role: {role }")

        try :
            self.admin_client.update("profiles", {"experience_level": role}, "id", user_id)
            return True

        except Exception as e :

            logger .error (f"Error updating user role: {e }")

            return False



    def vector_search (

    self ,

    embedding :List [float ],

    top_k :int =5 ,

    similarity_threshold :float =0.3 ,

    source_filter :Optional [str ]=None

    )->List [VectorSearchResult ]:

        """

        Search medical knowledge base using vector similarity.

        Uses pgvector's <=> operator for cosine distance.


        Args:

            embedding: Query embedding vector (384 dimensions)

            top_k: Number of results to return

            similarity_threshold: Minimum similarity score

            source_filter: Optional filter by source_type (pubmed, textbook, feedback)


        Returns:

            List of VectorSearchResult objects

        """

        try :

            params ={

            "query_embedding":embedding ,

            "match_threshold":similarity_threshold ,

            "match_count":top_k

            }



            if source_filter :

                params ["filter_source"]=source_filter



            data = self.client.rpc("search_medical_knowledge", params)



            results =[]

            for item in (data if data else []):

                results .append (VectorSearchResult (

                id =item ["id"],

                content =item ["content"],

                similarity =item ["similarity"],

                source_type =item .get ("source_type","unknown"),

                created_at =item .get ("created_at",""),

                metadata =item .get ("metadata")

                ))



            return results



        except Exception as e :

            logger .error (f"Vector search error: {e }")

            return []



    def add_knowledge (

    self ,

    content :str ,

    embedding :List [float ],

    source_type :str ="feedback"

    )->Optional [str ]:

        """

        Add new knowledge to the medical knowledge base.


        Args:

            content: Text content to add

            embedding: 384-dimensional embedding vector

            source_type: Origin of content (pubmed, textbook, feedback)


        Returns:

            ID of inserted record or None on failure

        """

        try :
            data = self.client.insert("medical_knowledge", {
                "content": content,
                "embedding": embedding,
                "source_type": source_type,
            })

            if data :
                return str (data [0 ]["id"])

            return None



        except Exception as e :

            logger .error (f"Error adding knowledge: {e }")

            return None




    def submit_feedback (

    self ,

    doctor_id :str ,

    original_diagnosis :str ,

    proposed_correction :str ,

    case_context :Dict [str ,Any ]

    )->Optional [str ]:

        """

        Submit doctor feedback to the queue for review.


        Args:

            doctor_id: UUID of the submitting doctor

            original_diagnosis: The system's original diagnosis

            proposed_correction: Doctor's suggested correction

            case_context: Full case data (history, ECG, labs)


        Returns:

            Feedback queue entry ID or None on failure

        """

        try :
            data = self.client.insert("feedback_queue", {
                "doctor_id": doctor_id,
                "original_diagnosis": original_diagnosis,
                "proposed_correction": proposed_correction,
                "case_context": case_context,
                "status": "pending",
            })

            if data :
                return str (data [0 ]["id"])

            return None



        except Exception as e :

            logger .error (f"Error submitting feedback: {e }")

            return None



    def get_pending_feedback (self ,status_filter :Optional [str ]=None )->List [Dict [str ,Any ]]:

        """

        Get feedback items for admin review.


        Args:

            status_filter: Optional filter (pending, approved, conflict)


        Returns:

            List of feedback queue items

        """

        try :
            qs = "select=*&order=created_at.desc"
            if status_filter:
                qs += f"&status=eq.{status_filter}"
            data = self.admin_client.select("feedback_queue", qs)
            return data if data else []

        except Exception as e :

            logger .error (f"Error fetching feedback: {e }")

            return []



    def update_feedback_status (self ,feedback_id :str ,status :str )->bool :

        """Update feedback status (admin operation)"""

        if status not in ["pending","approved","conflict"]:

            raise ValueError (f"Invalid status: {status }")

        try :
            self.admin_client.update("feedback_queue", {"status": status}, "id", feedback_id)
            return True

        except Exception as e :

            logger .error (f"Error updating feedback status: {e }")

            return False




    def check_conflict (

    self ,

    embedding :List [float ],

    proposed_diagnosis :str ,

    similarity_threshold :float =0.6

    )->Dict [str ,Any ]:

        """

        Check if proposed diagnosis conflicts with existing knowledge.

        Uses the resolve_medical_conflict SQL function.


        Args:

            embedding: Embedding of the case/diagnosis

            proposed_diagnosis: Doctor's proposed diagnosis

            similarity_threshold: Threshold for considering similar (default 60%)


        Returns:

            Dict with is_conflict and existing_diagnosis if found

        """

        try :
            data = self.client.rpc("resolve_medical_conflict", {
                "input_emb": embedding,
                "input_diag": proposed_diagnosis,
            })

            if data and len(data) > 0:
                result = data[0]
                return {
                    "is_conflict": result.get("is_conflict", False),
                    "existing_diagnosis": result.get("db_diag", None),
                }

            return {"is_conflict":False ,"existing_diagnosis":None }

        except Exception as e :

            logger .error (f"Conflict check error: {e }")

            return {"is_conflict":False ,"existing_diagnosis":None ,"error":str (e )}



    def get_bypass_stats (self )->Dict [str ,int ]:

        """Get statistics on ECG/Lab bypasses for admin dashboard"""

        try :
            data = self.client.rpc("get_bypass_statistics")
            return data if data else {"ecg_bypassed":0 ,"labs_bypassed":0 ,"total_cases":0 }

        except Exception as e :

            logger .error (f"Error fetching bypass stats: {e }")

            return {"ecg_bypassed":0 ,"labs_bypassed":0 ,"total_cases":0 }



    def get_diagnosis_stats (self )->Dict [str ,Any ]:

        """Get diagnosis statistics for admin dashboard"""

        try :
            data = self.client.rpc("get_diagnosis_statistics")
            return data if data else {}

        except Exception as e :

            logger .error (f"Error fetching diagnosis stats: {e }")

            return {}




_supabase_client :Optional [SupabaseClient ]=None



def get_supabase_client ()->SupabaseClient :

    """Get or create the Supabase client singleton"""

    global _supabase_client

    if _supabase_client is None :

        _supabase_client =SupabaseClient ()

    return _supabase_client
