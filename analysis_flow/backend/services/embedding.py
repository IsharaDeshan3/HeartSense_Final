"""

Embedding Service - Handles text to vector conversion

Uses sentence-transformers with all-MiniLM-L6-v2 (384 dimensions)

"""



import logging 

from typing import List ,Union 

import numpy as np 

from sentence_transformers import SentenceTransformer 



logger =logging .getLogger (__name__ )





class EmbeddingService :

    """

    Service for generating text embeddings.

    Uses all-MiniLM-L6-v2 which outputs 384-dimensional vectors.

    """



    def __init__ (self ,model_name :str ="all-MiniLM-L6-v2"):

        """

        Initialize the embedding service.

        

        Args:

            model_name: Name of the sentence-transformer model

        """

        logger .info (f"Loading embedding model: {model_name }")

        self .model =SentenceTransformer (model_name )

        self .dimension =384 

        logger .info (f"Embedding model loaded: {self .dimension }D vectors")



    def embed (self ,text :str ,normalize :bool =True )->List [float ]:

        """

        Generate embedding for a single text.

        

        Args:

            text: Input text to embed

            normalize: Whether to L2-normalize the vector

            

        Returns:

            List of floats representing the embedding

        """

        embedding =self .model .encode (text )

        embedding =np .array (embedding )



        if normalize :

            embedding =embedding /np .linalg .norm (embedding )



        return embedding .astype ('float32').tolist ()



    def embed_batch (self ,texts :List [str ],normalize :bool =True )->List [List [float ]]:

        """

        Generate embeddings for multiple texts.

        

        Args:

            texts: List of input texts

            normalize: Whether to L2-normalize vectors

            

        Returns:

            List of embedding vectors

        """

        embeddings =self .model .encode (texts )



        if normalize :

            norms =np .linalg .norm (embeddings ,axis =1 ,keepdims =True )

            embeddings =embeddings /norms 



        return embeddings .astype ('float32').tolist ()



    def similarity (self ,vec1 :List [float ],vec2 :List [float ])->float :

        """

        Calculate cosine similarity between two vectors.

        

        Args:

            vec1: First embedding vector

            vec2: Second embedding vector

            

        Returns:

            Cosine similarity score (0-1)

        """

        v1 =np .array (vec1 )

        v2 =np .array (vec2 )

        return float (np .dot (v1 ,v2 )/(np .linalg .norm (v1 )*np .linalg .norm (v2 )))

