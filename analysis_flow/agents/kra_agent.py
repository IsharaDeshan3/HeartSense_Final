"""

KRA Agent - Client for Hugging Face Space

Knowledge Reasoning Agent using Meditron-7B



Handles communication with the KRA endpoint deployed on HF Spaces.

"""



import os 

import requests 

import json 

import logging 

from dataclasses import dataclass ,field 

from typing import List ,Dict ,Optional ,Any 

from dotenv import load_dotenv ,find_dotenv 





load_dotenv (find_dotenv ())





logger =logging .getLogger (__name__ )





@dataclass 

class Diagnosis :

    """Single diagnosis with confidence and evidence"""

    condition :str 

    confidence :float 

    evidence :List [str ]=field (default_factory =list )

    clinical_features :List [str ]=field (default_factory =list )

    severity :str ="MODERATE"



    def to_dict (self )->Dict [str ,Any ]:

        """Convert to dictionary"""

        return {

        "condition":self .condition ,

        "confidence":self .confidence ,

        "evidence":self .evidence ,

        "clinical_features":self .clinical_features ,

        "severity":self .severity 

        }



    @classmethod 

    def from_dict (cls ,data :Dict [str ,Any ])->"Diagnosis":

        """Create from dictionary"""

        return cls (

        condition =data .get ("condition","Unknown"),

        confidence =data .get ("confidence",0.5 ),

        evidence =data .get ("evidence",[]),

        clinical_features =data .get ("clinical_features",[]),

        severity =data .get ("severity","MODERATE")

        )





@dataclass 

class KRAOutput :

    """Complete KRA analysis output"""

    diagnoses :List [Diagnosis ]

    uncertainties :List [str ]=field (default_factory =list )

    recommended_tests :List [str ]=field (default_factory =list )

    red_flags :List [str ]=field (default_factory =list )

    raw_output :str =""

    retrieval_quality :Dict =field (default_factory =dict )

    success :bool =True 

    error_message :str =""



    def to_dict (self )->Dict [str ,Any ]:

        """Convert to dictionary for serialization"""

        return {

        "diagnoses":[d .to_dict ()for d in self .diagnoses ],

        "uncertainties":self .uncertainties ,

        "recommended_tests":self .recommended_tests ,

        "red_flags":self .red_flags ,

        "retrieval_quality":self .retrieval_quality ,

        "success":self .success ,

        "error_message":self .error_message 

        }



    def get_top_diagnosis (self )->Optional [Diagnosis ]:

        """Get highest confidence diagnosis"""

        if not self .diagnoses :

            return None 

        return max (self .diagnoses ,key =lambda d :d .confidence )



    def has_critical_findings (self )->bool :

        """Check if any diagnosis is critical"""

        return any (d .severity =="CRITICAL"for d in self .diagnoses )or len (self .red_flags )>0 





class KRAAgent :

    """

    Client for KRA Hugging Face Space

    

    The KRA (Knowledge Reasoning Agent) uses Meditron-7B to perform

    medical diagnostic reasoning based on symptoms and retrieved context.

    """



    def __init__ (self ,

    hf_token :Optional [str ]=None ,

    endpoint :Optional [str ]=None ,

    timeout :int =120 ):

        """

        Initialize KRA Agent client

        

        Args:

            hf_token: Hugging Face API token (uses HF_TOKEN env var if not provided)

            endpoint: Custom endpoint URL (uses KRA_ENDPOINT env var if not provided)

            timeout: Request timeout in seconds (default 120 for model inference)

        """

        self .hf_token =hf_token or os .getenv ("HF_TOKEN")

        self .timeout =timeout 





        self .endpoint =endpoint or os .getenv ("KRA_ENDPOINT")



        if not self .endpoint :

            raise ValueError (

            "KRA endpoint not configured. Set KRA_ENDPOINT environment variable "

            "or pass endpoint parameter."

            )





        if not self .endpoint .endswith ("/api/predict"):

            self .endpoint =self .endpoint .rstrip ("/")+"/api/predict"



        self .headers ={

        "Content-Type":"application/json"

        }





        if self .hf_token :

            self .headers ["Authorization"]=f"Bearer {self .hf_token }"



        logger .info (f"KRA Agent initialized with endpoint: {self .endpoint }")



    def analyze (self ,

    symptoms :str ,

    context :str ,

    retrieval_quality :Optional [Dict ]=None )->KRAOutput :

        """

        Send symptoms to KRA for analysis

        

        Args:

            symptoms: Patient symptoms/presentation

            context: Retrieved medical context from knowledge base

            retrieval_quality: Quality metrics from FAISS retrieval

            

        Returns:

            KRAOutput with diagnoses and analysis

        """

        if retrieval_quality is None :

            retrieval_quality ={"status":"MEDIUM","confidence":0.5 }



        quality_str =retrieval_quality .get ("status","MEDIUM")





        payload ={

        "data":[symptoms ,context ,quality_str ]

        }



        logger .info (f"Sending analysis request to KRA...")

        logger .debug (f"Symptoms: {symptoms [:100 ]}...")



        try :

            response =requests .post (

            self .endpoint ,

            json =payload ,

            headers =self .headers ,

            timeout =self .timeout 

            )

            response .raise_for_status ()



            result =response .json ()

            logger .debug (f"Raw KRA response: {result }")





            if "data"in result and len (result ["data"])>0 :

                output_data =result ["data"][0 ]





                if isinstance (output_data ,str ):

                    try :

                        output_data =json .loads (output_data )

                    except json .JSONDecodeError :



                        return KRAOutput (

                        diagnoses =[],

                        raw_output =output_data ,

                        retrieval_quality =retrieval_quality ,

                        success =True 

                        )



                return self ._parse_response (output_data ,retrieval_quality )



            raise ValueError ("Invalid response format from KRA")



        except requests .exceptions .Timeout :

            logger .error ("KRA request timed out")

            return KRAOutput (

            diagnoses =[],

            retrieval_quality =retrieval_quality ,

            success =False ,

            error_message ="KRA request timed out. The model may be loading."

            )

        except requests .exceptions .RequestException as e :

            logger .error (f"KRA connection failed: {e }")

            return KRAOutput (

            diagnoses =[],

            retrieval_quality =retrieval_quality ,

            success =False ,

            error_message =f"KRA connection failed: {str (e )}"

            )

        except Exception as e :

            logger .error (f"KRA analysis error: {e }")

            return KRAOutput (

            diagnoses =[],

            retrieval_quality =retrieval_quality ,

            success =False ,

            error_message =f"KRA analysis error: {str (e )}"

            )



    def _parse_response (self ,data :Dict ,retrieval_quality :Dict )->KRAOutput :

        """Parse KRA response into structured output"""

        diagnoses =[]



        for d in data .get ("diagnoses",[]):

            diagnoses .append (Diagnosis .from_dict (d ))





        diagnoses .sort (key =lambda x :x .confidence ,reverse =True )



        return KRAOutput (

        diagnoses =diagnoses ,

        uncertainties =data .get ("uncertainties",[]),

        recommended_tests =data .get ("recommended_tests",[]),

        red_flags =data .get ("red_flags",[]),

        raw_output =json .dumps (data ),

        retrieval_quality =retrieval_quality ,

        success =True 

        )



    def health_check (self )->Dict [str ,Any ]:

        """

        Check if KRA endpoint is healthy

        

        Returns:

            Dict with health status information

        """

        try :



            response =requests .get (

            self .endpoint .replace ("/api/predict","/"),

            headers =self .headers ,

            timeout =10 

            )



            return {

            "healthy":response .status_code ==200 ,

            "status_code":response .status_code ,

            "endpoint":self .endpoint 

            }

        except requests .exceptions .RequestException as e :

            return {

            "healthy":False ,

            "error":str (e ),

            "endpoint":self .endpoint 

            }



    def warm_up (self )->bool :

        """

        Send a warm-up request to load the model

        

        Returns:

            True if warm-up successful

        """

        logger .info ("Warming up KRA model...")



        result =self .analyze (

        symptoms ="Test warm-up request",

        context ="No context",

        retrieval_quality ={"status":"LOW","confidence":0.0 }

        )



        return result .success 





def create_kra_agent (

hf_token :Optional [str ]=None ,

endpoint :Optional [str ]=None ,

model_endpoint :Optional [str ]=None ,

timeout :int =120 ,

)->KRAAgent :

    """

    Factory function to create KRA agent

    

    Args:

        hf_token: Hugging Face API token

        endpoint: Custom endpoint URL

        timeout: Request timeout in seconds

        

    Returns:

        Configured KRAAgent instance

    """



    resolved_endpoint =endpoint or model_endpoint 

    return KRAAgent (hf_token =hf_token ,endpoint =resolved_endpoint ,timeout =timeout )







def analyze_symptoms (

symptoms :str ,

context :str ,

retrieval_quality :Optional [Dict ]=None 

)->KRAOutput :

    """

    Convenience function to analyze symptoms without managing agent instance

    

    Args:

        symptoms: Patient symptoms

        context: Medical context

        retrieval_quality: Quality of retrieval

        

    Returns:

        KRAOutput with analysis results

    """

    agent =create_kra_agent ()

    return agent .analyze (symptoms ,context ,retrieval_quality )

