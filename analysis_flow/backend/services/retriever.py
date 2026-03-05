"""

Supabase Retriever - Vector search using pgvector

Replaces local FAISS retriever with cloud-based solution

"""



import logging 

from typing import List ,Dict ,Optional ,Any 

from dataclasses import dataclass 



from backend .database import get_supabase_client ,SupabaseClient ,VectorSearchResult 

from .embedding import EmbeddingService 



logger =logging .getLogger (__name__ )





@dataclass 

class RetrievalResult :

    """Result from knowledge retrieval"""

    text :str 

    similarity :float 

    source_type :str 

    category :Optional [str ]=None 

    metadata :Optional [Dict ]=None 





class SupabaseRetriever :

    """

    Knowledge retriever using Supabase pgvector.

    Replaces the local FAISS-based retriever.

    """



    def __init__ (

    self ,

    embedding_service :Optional [EmbeddingService ]=None ,

    supabase_client :Optional [SupabaseClient ]=None 

    ):

        """

        Initialize the Supabase retriever.

        

        Args:

            embedding_service: Service for generating embeddings

            supabase_client: Supabase client instance

        """

        self .embedding_service =embedding_service or EmbeddingService ()

        self .supabase =supabase_client or get_supabase_client ()

        logger .info ("Supabase retriever initialized")



    def search (

    self ,

    query :str ,

    top_k :int =5 ,

    source_filter :Optional [str ]=None ,

    similarity_threshold :float =0.3 

    )->List [RetrievalResult ]:

        """

        Search for relevant medical knowledge.

        

        Args:

            query: Search query (symptoms, conditions, etc.)

            top_k: Number of results to return

            source_filter: Optional filter by source type

            similarity_threshold: Minimum similarity score

            

        Returns:

            List of RetrievalResult objects

        """



        query_embedding =self .embedding_service .embed (query )





        results =self .supabase .vector_search (

        embedding =query_embedding ,

        top_k =top_k ,

        similarity_threshold =similarity_threshold ,

        source_filter =source_filter 

        )





        return [

        RetrievalResult (

        text =r .content ,

        similarity =r .similarity ,

        source_type =r .source_type ,

        metadata =r .metadata 

        )

        for r in results 

        ]



    def get_context_string (

    self ,

    query :str ,

    top_k :int =5 ,

    include_rare_cases :bool =True 

    )->str :

        """

        Get formatted context string for LLM input.

        

        Args:

            query: Search query

            top_k: Number of main results

            include_rare_cases: Whether to include rare case references

            

        Returns:

            Formatted context string

        """



        results =self .search (query ,top_k =top_k )



        context_parts =[]

        for i ,r in enumerate (results ,1 ):

            context_parts .append (f"[{i }] ({r .source_type }, sim={r .similarity :.2f})\n{r .text }")



        context ="\n\n".join (context_parts )





        if include_rare_cases :

            rare_results =self .search (

            query ,

            top_k =3 ,

            source_filter ="rare_case"

            )

            if rare_results :

                context +="\n\n--- RARE CASE REFERENCES ---\n"

                for r in rare_results :

                    pmid =r .metadata .get ("pmid","N/A")if r .metadata else "N/A"

                    context +=f"\nPMID:{pmid }: {r .text [:300 ]}...\n"



        return context 



    def calculate_retrieval_quality (

    self ,

    query :str ,

    top_k :int =5 

    )->Dict [str ,Any ]:

        """

        Calculate quality metrics for retrieval results.

        

        Args:

            query: Search query

            top_k: Number of results to evaluate

            

        Returns:

            Quality metrics dictionary

        """

        results =self .search (query ,top_k =top_k )



        if not results :

            return {

            "status":"NO_RESULTS",

            "avg_similarity":0 ,

            "top_similarity":0 ,

            "count":0 

            }



        similarities =[r .similarity for r in results ]

        avg_sim =sum (similarities )/len (similarities )

        top_sim =max (similarities )



        if top_sim >=0.7 :

            status ="EXCELLENT"

        elif top_sim >=0.5 :

            status ="GOOD"

        elif top_sim >=0.3 :

            status ="FAIR"

        else :

            status ="POOR"



        return {

        "status":status ,

        "avg_similarity":avg_sim ,

        "top_similarity":top_sim ,

        "count":len (results )

        }



    def add_knowledge (

    self ,

    content :str ,

    source_type :str ="feedback"

    )->Optional [str ]:

        """

        Add new knowledge to the database.

        

        Args:

            content: Text content to add

            source_type: Origin of content

            

        Returns:

            ID of inserted record or None

        """

        embedding =self .embedding_service .embed (content )

        return self .supabase .add_knowledge (

        content =content ,

        embedding =embedding ,

        source_type =source_type 

        )

