"""

FAISS Retrieval Module for KRA-ORA System

Handles vector search and context retrieval from the knowledge base

"""



import faiss 

import pickle 

import numpy as np 

from sentence_transformers import SentenceTransformer 

from typing import List ,Dict ,Tuple 





class FAISSRetriever :

    """Handles retrieval of relevant medical knowledge from FAISS index"""



    def __init__ (self ,

    index_path :str ='knowledge_base/vector_index.faiss',

    metadata_path :str ='knowledge_base/vector_db_metadata.pkl',

    model_name :str ='all-MiniLM-L6-v2'):

        """

        Initialize the FAISS retriever

        

        Args:

            index_path: Path to FAISS index file

            metadata_path: Path to metadata pickle file

            model_name: Name of the sentence transformer model

        """

        print ("Initializing FAISS Retriever...")





        self .index =faiss .read_index (index_path )

        print (f"[OK] Loaded FAISS index: {self .index .ntotal } vectors")





        with open (metadata_path ,'rb')as f :

            self .metadata =pickle .load (f )



        self .ids =self .metadata ['ids']

        self .texts =self .metadata ['texts']

        self .records =self .metadata ['records']

        print (f"[OK] Loaded metadata: {len (self .records )} records")





        print (f"Loading embedding model: {model_name }...")

        self .model =SentenceTransformer (model_name )

        print (f"[OK] Model loaded")



    def embed_query (self ,query :str )->np .ndarray :

        """

        Embed a query string into a vector

        

        Args:

            query: Text query to embed

            

        Returns:

            numpy array of embeddings

        """

        embedding =self .model .encode ([query ])[0 ]



        embedding =embedding /np .linalg .norm (embedding )

        return embedding .astype ('float32')



    def search (self ,

    query :str ,

    top_k :int =5 ,

    filter_condition :str =None ,

    filter_category :str =None ,

    filter_severity :str =None ,

    prefer_parent :bool =False )->List [Dict ]:

        """

        Search for relevant documents given a query

        

        Args:

            query: Search query (e.g., patient symptoms)

            top_k: Number of top results to return

            filter_condition: Optional condition to filter results

            filter_category: Optional category filter (cardiology, general, diagnosis, rare_case)

            filter_severity: Optional severity filter (CRITICAL, HIGH, MODERATE, LOW)

            prefer_parent: If True, prefer parent chunks over child chunks

            

        Returns:

            List of dictionaries containing retrieved documents and metadata

        """



        query_vector =self .embed_query (query )

        query_vector =query_vector .reshape (1 ,-1 )





        search_k =top_k *4 if any ([filter_condition ,filter_category ,filter_severity ,prefer_parent ])else top_k *2 

        distances ,indices =self .index .search (query_vector ,search_k )





        results =[]

        seen_parents =set ()



        for idx ,distance in zip (indices [0 ],distances [0 ]):

            if idx ==-1 :

                continue 



            record =self .records [idx ]

            text =self .texts [idx ]





            if filter_condition and record .get ('condition')!=filter_condition :

                continue 

            if filter_category and record .get ('category')!=filter_category :

                continue 

            if filter_severity and record .get ('severity')!=filter_severity :

                continue 





            if prefer_parent :

                parent_id =record .get ('parent_id')or record .get ('chunk_id')

                if parent_id in seen_parents :

                    continue 

                seen_parents .add (parent_id )





            result ={

            'index':int (idx ),

            'score':float (distance ),

            'chunk_id':record .get ('chunk_id',self .ids [idx ]),

            'parent_id':record .get ('parent_id'),

            'chunk_type':record .get ('chunk_type','parent'),

            'text':text if text and text !='None'else self ._build_text_from_record (record ),

            'record':record ,

            'source_file':record .get ('source_file',''),

            'source_type':record .get ('source_type','textbook'),

            'category':record .get ('category','general'),

            'condition':record .get ('condition','Unknown'),

            'severity':record .get ('severity'),

            'age_range':record .get ('age_range'),

            'sex':record .get ('sex'),

            'keywords':record .get ('keywords',[]),

            'pmid':record .get ('pmid','')

            }

            results .append (result )





            if len (results )>=top_k :

                break 



        return results 



    def _build_text_from_record (self ,record :Dict )->str :

        """

        Build text representation from record metadata

        

        Args:

            record: Record dictionary

            

        Returns:

            Text representation

        """

        parts =[]

        if record .get ('title'):

            parts .append (record ['title'])

        if record .get ('condition'):

            parts .append (f"Condition: {record ['condition']}")

        if record .get ('keywords'):

            keywords =record ['keywords']

            if isinstance (keywords ,list ):

                parts .append (f"Keywords: {', '.join (keywords )}")

        return ' | '.join (parts )if parts else "No text available"



    def get_context_string (self ,

    query :str ,

    top_k :int =5 ,

    include_metadata :bool =True )->str :

        """

        Get a formatted context string for LLM prompting

        

        Args:

            query: Search query

            top_k: Number of results

            include_metadata: Whether to include metadata in context

            

        Returns:

            Formatted context string

        """

        results =self .search (query ,top_k )



        context_parts =[]

        for i ,result in enumerate (results ,1 ):

            context_parts .append (f"Context {i }:")

            context_parts .append (f"{result ['text']}")



            if include_metadata :

                metadata_parts =[]

                if result .get ('condition')and result ['condition']!='Unknown':

                    metadata_parts .append (f"Condition: {result ['condition']}")

                if result .get ('pmid'):

                    metadata_parts .append (f"Source: PMID {result ['pmid']}")

                if metadata_parts :

                    context_parts .append (f"({', '.join (metadata_parts )})")



            context_parts .append ("")



        return '\n'.join (context_parts )



    def calculate_retrieval_quality (self ,query :str ,top_k :int =5 )->Dict :

        """

        Calculate quality metrics for retrieval

        

        Args:

            query: Search query

            top_k: Number of results

            

        Returns:

            Dictionary with quality metrics

        """

        results =self .search (query ,top_k )



        if not results :

            return {

            'status':'NO_RESULTS',

            'confidence':0.0 ,

            'top_score':0.0 ,

            'avg_score':0.0 

            }



        scores =[r ['score']for r in results ]

        top_score =max (scores )

        avg_score =sum (scores )/len (scores )







        if top_score >0.7 :

            status ='HIGH_CONFIDENCE'

        elif top_score >0.5 :

            status ='MEDIUM_CONFIDENCE'

        else :

            status ='LOW_CONFIDENCE'



        return {

        'status':status ,

        'confidence':top_score ,

        'top_score':top_score ,

        'avg_score':avg_score ,

        'num_results':len (results )

        }







def retrieve_context (query :str ,

top_k :int =5 ,

index_path :str ='knowledge_base/vector_index.faiss',

metadata_path :str ='knowledge_base/vector_db_metadata.pkl')->Tuple [str ,Dict ]:

    """

    Quick retrieval function

    

    Args:

        query: Search query

        top_k: Number of results

        index_path: Path to FAISS index

        metadata_path: Path to metadata

        

    Returns:

        Tuple of (context_string, quality_metrics)

    """

    retriever =FAISSRetriever (index_path ,metadata_path )

    context =retriever .get_context_string (query ,top_k )

    quality =retriever .calculate_retrieval_quality (query ,top_k )

    return context ,quality 





if __name__ =="__main__":



    print ("\n"+"="*70 )

    print ("TESTING FAISS RETRIEVER")

    print ("="*70 )



    retriever =FAISSRetriever ()





    test_queries =[

    "58-year-old male with acute chest pain and shortness of breath",

    "patient with irregular heartbeat and palpitations",

    "sudden cardiac arrest in young athlete"

    ]



    for query in test_queries :

        print (f"\n{'='*70 }")

        print (f"Query: {query }")

        print (f"{'='*70 }")





        quality =retriever .calculate_retrieval_quality (query ,top_k =3 )

        print (f"\nRetrieval Quality: {quality ['status']}")

        print (f"  - Confidence: {quality ['confidence']:.3f}")

        print (f"  - Avg Score: {quality ['avg_score']:.3f}")





        context =retriever .get_context_string (query ,top_k =3 )

        print (f"\nRetrieved Context:")

        print (context [:500 ]+"..."if len (context )>500 else context )

